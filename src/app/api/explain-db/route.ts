// src/app/api/explain-db/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  generateText,
  PRIMARY_MODEL,
  REASONING_EFFORT,
  streamTextChunks,
} from '@/lib/ai';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';
import {
  MARKDOWN_STYLE_RULES,
  SOURCE_HANDLING_RULES,
  wrapSource,
} from '@/lib/ai-prompts';

export const runtime = 'nodejs';
export const maxDuration = 300;

const L = process.env.LOG_EXPLAIN === '1';
const log = (...a: any[]) => {
  if (L) console.log('[explain-db]', ...a);
};
const err = (...a: any[]) => {
  if (L) console.error('[explain-db]', ...a);
};

type StripOpts = { title?: string; lectureTitle?: string; isChunk?: boolean };

function stripPreamble(md: string, opts?: StripOpts): string {
  // Be conservative on streaming: do not mutate incremental chunks
  if (opts?.isChunk) return String(md ?? '');

  let out = String(md ?? '');

  // Remove obvious filler strictly at the start
  out = out.replace(
    /^(?:\s*)(?:of course|sure\,?|here (?:is|are)|crafting learning module\.\.\.)[^\n]*\n*/i,
    ''
  );

  // Drop a single leading heading (ATX or Setext) at the very beginning only
  out = out.replace(/^\s{0,3}#{1,6}\s+[^\n]+\n+/, '');
  out = out.replace(/^\s*([^\n]+)\n(?:=+|-+)\s*\n+/, '');

  // If first non-empty line equals the provided title(s), remove that line only
  if (opts?.title || opts?.lectureTitle) {
    const lines = out.split('\n');
    const firstIdx = lines.findIndex((l) => l.trim() !== '');
    if (firstIdx !== -1) {
      const firstLine = lines[firstIdx].trim();
      const equals = (a: string | undefined) =>
        !!a &&
        firstLine.localeCompare(String(a).trim(), undefined, {
          sensitivity: 'accent',
        }) === 0;
      if (equals(opts.title) || equals(opts.lectureTitle)) {
        lines.splice(firstIdx, 1);
        out = lines.join('\n');
      }
    }
  }

  // Drop at most the first two very short meta paragraphs that look like disclaimers
  const paras = out.split(/\n{2,}/);
  if (paras.length) {
    const preambleRe =
      /\b(document\s+context|provided\s+context|limited\s+context|insufficient\s+context|lack\s+of\s+context|context\s+alone|based\s+on\s+the\s+provided\s+(document|context)|this\s+(section|explanation)\s+will)\b/i;
    let removed = 0;
    for (let i = 0; i < Math.min(2, paras.length); i++) {
      const trimmed = paras[i].trim();
      if (trimmed.length <= 180 && preambleRe.test(trimmed)) {
        paras.splice(i, 1);
        removed++;
        i--;
        if (removed >= 2) break;
      }
    }
    out = paras.join('\n\n');
  }

  return out.trim();
}

// Merge streaming chunks without gluing words together across boundaries.
function appendChunkSafely(previous: string, next: string): string {
  if (!next) return previous || '';
  if (!previous) return next;
  const lastChar = previous.slice(-1);
  const firstChar = next[0];
  const isWordChar = (ch: string) => /[A-Za-z0-9]/.test(ch);
  const needsSpace =
    ((isWordChar(lastChar) && isWordChar(firstChar)) ||
      (/[\.:;!?]$/.test(previous) && isWordChar(firstChar))) &&
    !/^\s/.test(next);
  return needsSpace ? previous + ' ' + next : previous + next;
}

function sanitizeDbText(s: string): string {
  return (s || '').replace(/\u0000/g, '');
}

/* --------------------------- delta-aware utilities -------------------------- */
const STOPWORDS = new Set(
  'the,be,to,of,and,a,in,that,have,i,it,for,not,on,with,he,as,you,do,at,by,from,or,an,are,is,was,were,which,one,all,this,can,will,if,about,into,than,then,there,also,other,more,most,each,any,very,just,like,so,well,may,might,should,shall,our,them,they,these,those,its,his,her,their,within,between,across,over,under,per,via,where,when,how,why,what,who,whom,whose,been,being,into,onto,off,up,down,out,again,further,once'.split(
    ','
  )
);

function stripMarkdownFormatting(md: string): string {
  let t = String(md || '');
  // Remove code fences and unwrap inline code (preserve the content)
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.replace(/`([^`]*)`/g, '$1');
  // Remove ATX headings and setext headings
  t = t.replace(/^\s{0,3}#{1,6}\s+.*$/gm, ' ');
  t = t.replace(/^.+\n(?:=+|-+)\s*$/gm, ' ');
  // Remove HTML tags
  t = t.replace(/<[^>]+>/g, ' ');
  // Convert bullets to sentences
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  return t;
}

function toSentences(text: string): string[] {
  const t = stripMarkdownFormatting(text).replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const parts = t
    .split(/(?<=\S[\.!?])\s+(?=[A-Z0-9("\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

function buildGist(md: string, maxSentences = 2, maxChars = 320): string {
  const sentences = toSentences(md).filter((s) => s.split(/\s+/).length >= 5);
  const gist = sentences.slice(0, maxSentences).join(' ');
  const clipped =
    gist.length > maxChars ? gist.slice(0, maxChars - 1) + '…' : gist;
  return clipped;
}

function tokenizeContentWords(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length >= 2 && !STOPWORDS.has(w));
}

function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(tokenizeContentWords(a));
  const B = new Set(tokenizeContentWords(b));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dedupeAgainstPrior(
  currentMd: string,
  priorMds: string[],
  threshold = 0.82
): string {
  // Back-compat: keep old behavior as a fallback if structure-preserving fails
  try {
    return dedupeMarkdownPreservingStructure(currentMd, priorMds, threshold);
  } catch {
    if (!priorMds.length) return currentMd || '';
    const priorSentences: string[] = [];
    for (const p of priorMds) priorSentences.push(...toSentences(p));
    const currentSentences = toSentences(currentMd);
    const kept: string[] = [];
    outer: for (const s of currentSentences) {
      for (const p of priorSentences) {
        if (jaccardSimilarity(s, p) >= threshold) continue outer;
      }
      kept.push(s);
    }
    const out = kept.join(' ');
    return out.trim() || currentMd;
  }
}

function dedupeMarkdownPreservingStructure(
  currentMd: string,
  priorMds: string[],
  threshold = 0.82
): string {
  if (!currentMd) return '';
  const priorSentences: string[] = [];
  for (const p of priorMds) priorSentences.push(...toSentences(p));

  const isListItem = (l: string): boolean => /^\s*(?:[*+-]|\d+\.)\s+/.test(l);
  const isFence = (l: string): boolean => /^\s*```/.test(l);
  const isHeading = (l: string, next?: string): boolean => {
    if (/^\s{0,3}#{1,6}\s+/.test(l)) return true;
    const trimmed = (next || '').trim();
    return (
      l.trim().length > 0 && (/^=+$/.test(trimmed) || /^-+$/.test(trimmed))
    );
  };
  const isTableRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l);
  const isBlank = (l: string): boolean => /^\s*$/.test(l);

  const lines = String(currentMd).split('\n');
  const outBlocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Code fence blocks: copy verbatim until closing fence
    if (isFence(line)) {
      const block: string[] = [line];
      i++;
      while (i < lines.length) {
        block.push(lines[i]);
        if (isFence(lines[i])) {
          i++;
          break;
        }
        i++;
      }
      outBlocks.push(block.join('\n'));
      // Skip trailing blank lines compactly
      while (i < lines.length && isBlank(lines[i])) i++;
      continue;
    }

    // Headings (ATX or setext)
    if (isHeading(line, lines[i + 1])) {
      if (/^\s{0,3}#{1,6}\s+/.test(line)) {
        outBlocks.push(line.trimEnd());
        i++;
      } else {
        // setext two-line heading
        const h1 = line;
        const h2 = lines[i + 1] || '';
        outBlocks.push([h1, h2].join('\n'));
        i += 2;
      }
      while (i < lines.length && isBlank(lines[i])) i++;
      continue;
    }

    // Tables: pass through contiguous table rows
    if (isTableRow(line)) {
      const block: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      outBlocks.push(block.join('\n'));
      while (i < lines.length && isBlank(lines[i])) i++;
      continue;
    }

    // Lists: dedupe per item
    if (isListItem(line)) {
      const listLines: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        if (isListItem(lines[i]) || /^\s{2,}\S/.test(lines[i])) {
          listLines.push(lines[i]);
          i++;
        } else if (
          isTableRow(lines[i]) ||
          isFence(lines[i]) ||
          isHeading(lines[i], lines[i + 1])
        ) {
          break; // end list block before other block types
        } else {
          // treat as paragraph start -> stop list
          break;
        }
      }
      // Parse items
      type Item = { indent: string; marker: string; content: string[] };
      const items: Item[] = [];
      for (const ll of listLines) {
        const m = ll.match(/^(\s*)(?:([*+-])|(\d+)\.)\s+(.*)$/);
        if (m) {
          const indent = m[1] || '';
          const marker = m[2] ? m[2] : `${m[3]}.`;
          const rest = m[4] || '';
          items.push({ indent, marker, content: [rest] });
        } else if (items.length) {
          const cont = ll.replace(/^\s+/, '').trim();
          if (cont) items[items.length - 1].content.push(cont);
        }
      }
      const outList: string[] = [];
      for (const it of items) {
        const raw = it.content.join(' ');
        const sentences = toSentences(raw);
        const kept: string[] = [];
        outerList: for (const s of sentences) {
          for (const p of priorSentences) {
            if (jaccardSimilarity(s, p) >= threshold) continue outerList;
          }
          kept.push(s);
        }
        const rebuilt = kept.join(' ').trim();
        if (rebuilt) outList.push(`${it.indent}${it.marker} ${rebuilt}`);
      }
      if (outList.length) outBlocks.push(outList.join('\n'));
      while (i < lines.length && isBlank(lines[i])) i++;
      continue;
    }

    // Paragraphs and other text: gather until blank line
    if (!isBlank(line)) {
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        !isBlank(lines[i]) &&
        !isFence(lines[i]) &&
        !isListItem(lines[i]) &&
        !isTableRow(lines[i]) &&
        !isHeading(lines[i], lines[i + 1])
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      const raw = paraLines.join(' ');
      const sentences = toSentences(raw);
      const kept: string[] = [];
      outerPara: for (const s of sentences) {
        for (const p of priorSentences) {
          if (jaccardSimilarity(s, p) >= threshold) continue outerPara;
        }
        kept.push(s);
      }
      const rebuilt = kept.join(' ').trim();
      if (rebuilt) outBlocks.push(rebuilt);
      while (i < lines.length && isBlank(lines[i])) i++;
      continue;
    }

    // Skip extra blank lines
    while (i < lines.length && isBlank(lines[i])) i++;
  }

  return outBlocks.join('\n\n').trim() || currentMd;
}

function extractDoNotRepeatTerms(priorMds: string[], topK = 24): string[] {
  const freq = new Map<string, number>();
  const bad = new Set([
    'Overview',
    'Introduction',
    'Summary',
    'Appendix',
    'Section',
    'Chapter',
  ]);
  const push = (w: string) => freq.set(w, (freq.get(w) || 0) + 1);
  for (const md of priorMds) {
    const text = stripMarkdownFormatting(md);
    const tokens = text.split(/[^A-Za-z0-9\-]+/).filter(Boolean);
    for (const tok of tokens) {
      // ALL-CAPS acronyms or Capitalized terms
      if (/^[A-Z]{2,}[A-Z0-9\-]*$/.test(tok)) {
        if (tok.length <= 2) continue; // skip tiny
        push(tok);
      } else if (/^[A-Z][a-z]+(?:[\-\s][A-Z][a-z]+)?$/.test(tok)) {
        if (bad.has(tok)) continue;
        push(tok);
      }
    }
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([w]) => w);
}

type CoveragePack = {
  outline: string[];
  currentTitle: string;
  priorGists: Array<{ title: string; gist: string }>;
  doNotRepeat: string[];
  recentFull: Array<{ title: string; text: string }>;
};

async function buildCoveragePack(
  lectureId: string,
  currentSubtopicId: string | null,
  currentTitleFallback: string
): Promise<CoveragePack | null> {
  if (!lectureId) return null;
  try {
    const subtopics = await prisma.subtopic.findMany({
      where: { lectureId },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, explanation: true, order: true },
    });
    if (!subtopics.length) return null;
    const outline = subtopics.map((s) => s.title);
    let currentIdx = -1;
    if (currentSubtopicId) {
      currentIdx = subtopics.findIndex((s) => s.id === currentSubtopicId);
    }
    const currentTitle =
      currentIdx >= 0
        ? subtopics[currentIdx].title
        : currentTitleFallback || subtopics[0].title;
    const prior = currentIdx >= 0 ? subtopics.slice(0, currentIdx) : [];
    const priorWithText = prior.filter(
      (p) => (p.explanation || '').trim().length > 0
    );
    const priorGists = priorWithText
      .map((p) => ({
        title: p.title,
        gist: buildGist(p.explanation || '', 2, 320),
      }))
      .filter((x) => x.gist);
    const doNotRepeat = extractDoNotRepeatTerms(
      priorWithText.map((p) => p.explanation || '')
    );
    const N = Math.max(
      0,
      parseInt(process.env.AI_DELTA_PRIOR_FULL_SECTIONS || '1', 10)
    );
    const recentSlice = N > 0 ? priorWithText.slice(-N) : [];
    const MAX_RECENT_CHARS = Math.max(
      800,
      parseInt(process.env.AI_DELTA_PRIOR_FULL_CHARS || '2400', 10)
    );
    const recentFull = recentSlice.map((p) => ({
      title: p.title,
      text:
        (p.explanation || '').length > MAX_RECENT_CHARS
          ? (p.explanation || '').slice(0, MAX_RECENT_CHARS)
          : p.explanation || '',
    }));
    return { outline, currentTitle, priorGists, doNotRepeat, recentFull };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const limit = rateLimit(
      rateLimitKey(req, 'explain', userId),
      userId ? 40 : 8,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many explanation requests. Please wait and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    const body = await req.json().catch(() => ({}) as any);
    const subtopicIn =
      typeof body?.subtopic === 'string' ? body.subtopic.trim() : '';
    const subtopicIdIn =
      typeof body?.subtopicId === 'string' ? body.subtopicId.trim() : '';
    const lectureIdIn =
      typeof body?.lectureId === 'string' ? body.lectureId.trim() : '';
    const docIn =
      typeof body?.documentContent === 'string' ? body.documentContent : '';
    const titleIn =
      typeof body?.lectureTitle === 'string' && body.lectureTitle.trim()
        ? body.lectureTitle.trim()
        : typeof body?.title === 'string' && body.title.trim()
          ? body.title.trim()
          : 'Lecture';
    const styleIn =
      typeof body?.style === 'string' && body.style.trim()
        ? body.style.trim().toLowerCase()
        : 'default';
    const coveredList = Array.isArray(body?.covered)
      ? (body.covered as any[])
          .map((c) => ({
            title: String((c as any)?.title || '').trim(),
            overview: String((c as any)?.overview || '').trim(),
          }))
          .filter((c) => c.title)
      : [];

    const subtopic = subtopicIn || 'Overview';
    const lectureTitle = titleIn;

    if (!lectureIdIn && docIn.trim().length < 50) {
      return NextResponse.json(
        { error: 'Document content is required for the public demo.' },
        { status: userId ? 400 : 401 }
      );
    }
    if ((lectureIdIn || subtopicIdIn) && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (subtopicIdIn && !lectureIdIn) {
      return NextResponse.json(
        { error: 'lectureId is required when persisting a subtopic.' },
        { status: 400 }
      );
    }

    let ownedLectureContent = '';
    if (lectureIdIn && userId) {
      const lecture = await prisma.lecture.findFirst({
        where: { id: lectureIdIn, userId },
        select: { originalContent: true },
      });
      if (!lecture) {
        return NextResponse.json(
          { error: 'Lecture not found.' },
          { status: 404 }
        );
      }
      ownedLectureContent = lecture.originalContent || '';

      if (subtopicIdIn) {
        const subtopicRow = await prisma.subtopic.findFirst({
          where: { id: subtopicIdIn, lectureId: lectureIdIn },
          select: { id: true },
        });
        if (!subtopicRow) {
          return NextResponse.json(
            { error: 'Subtopic not found.' },
            { status: 404 }
          );
        }
      }
    }

    const styleHint =
      styleIn === 'simplified'
        ? 'Explain as simply as possible for a beginner.'
        : styleIn === 'detailed'
          ? 'Go a bit deeper on nuances and edge cases.'
          : styleIn === 'example'
            ? 'Center the explanation around a concrete, realistic example.'
            : 'Use a balanced, concise explanation.';

    // Ignore client-selected model for explanation generation; use server defaults
    const preferredModel = undefined;
    const effectiveModel = PRIMARY_MODEL;
    log('IN', {
      lectureTitle,
      subtopic,
      style: styleIn,
      model: effectiveModel,
    });

    // Resolve document content for grounding
    let documentContent = ownedLectureContent;
    if (!documentContent && docIn) documentContent = docIn;
    documentContent = sanitizeDbText(documentContent);
    // Clip to keep prompts manageable
    const clip = (s: string, max = 20000) => {
      const t = (s || '').trim();
      return t.length > max ? t.slice(0, max) : t;
    };

    const systemMsg = [
      'You are writing ONE section of an in-progress lecture.',
      SOURCE_HANDLING_RULES,
      'Follow DELTA RULES strictly to avoid repetition and only add new information for the current section.',
      'Be concise and instructional; avoid preambles, meta commentary, and disclaimers.',
      MARKDOWN_STYLE_RULES,
    ].join(' ');
    const docLen = (documentContent || '').trim().length;
    const groundingLine =
      docLen < 400
        ? `If the DOCUMENT CONTEXT is missing or too short to be useful, write a concise, generally valid explanation of the subtopic. Make it accurate and educational without fabricating document-specific details.`
        : `Ground your explanation STRICTLY in the DOCUMENT CONTEXT when relevant.`;
    // Build coverage pack from DB to make generation delta-aware
    let coveragePack: CoveragePack | null = null;
    if (lectureIdIn) {
      coveragePack = await buildCoveragePack(
        lectureIdIn,
        subtopicIdIn || null,
        subtopic
      );
    }
    const packLines: string[] = [];
    if (coveragePack) {
      const nums = coveragePack.outline.map((t, i) => `${i + 1}. ${t}`);
      packLines.push('COVERAGE PACK:');
      packLines.push(`- Outline (ordered):\n${nums.join('\n')}`);
      packLines.push(`- Current: ${coveragePack.currentTitle}`);
      if (coveragePack.priorGists.length) {
        packLines.push('- Prior gists (already covered):');
        for (const g of coveragePack.priorGists)
          packLines.push(`  • ${g.title}: ${g.gist}`);
      }
      if (coveragePack.doNotRepeat.length) {
        packLines.push(
          `- DO NOT REDEFINE (terms/acronyms): ${coveragePack.doNotRepeat.join(', ')}`
        );
      }
      if (coveragePack.recentFull.length) {
        packLines.push('- Recent full prior text:');
        for (const r of coveragePack.recentFull) {
          packLines.push(`  <<< ${r.title} >>>`);
          packLines.push(r.text);
          packLines.push('  <<< END >>>');
        }
      }
    } else if (coveredList.length) {
      // Fallback: use client-provided covered list if present
      packLines.push('COVERAGE PACK (client provided):');
      packLines.push(JSON.stringify(coveredList, null, 2));
    }

    const deltaRules = [
      'DELTA RULES:',
      '- Write ONLY what is new for the current section; assume prior sections are known to the reader.',
      '- If a concept was already covered, DO NOT redefine it. Instead, reference briefly (e.g., "See: TLB Basics").',
      '- No generic intros or preambles; begin immediately with what is unique in this section.',
      '- At most one short recap sentence is allowed.',
      '- Output valid Markdown. No H1.',
      'FORMATTING RULES:',
      '- Prefer structured Markdown over long paragraphs.',
      '- Use "###" subheadings for 1–3 distinct parts only when helpful (not required).',
      '- Use bullet lists for enumerations, pros/cons, causes/effects, constraints.',
      '- Use numbered steps for processes/algorithms.',
      '- Bold key terms on first appearance when you define/contrast them.',
      '- Keep each paragraph to at most 2 sentences; break lines to keep paragraphs short.',
      '- If there are contrasting categories (e.g., External vs Internal), present as bullets with bold labels and 1–3 lines each.',
    ].join('\n');

    const prompt = [
      `Lecture title: "${lectureTitle}"`,
      `Subtopic: "${subtopic}"`,
      `Style: ${styleHint}`,
      deltaRules,
      packLines.join('\n'),
      groundingLine,
      `Write 190–390 words of clean Markdown.`,
      `Start directly with content. Do NOT mention the words "document", "context", "provided context", "this section", or any limitations.`,
      `Do NOT number subtopics. Do NOT add a standalone H1.`,
      `Use short paragraphs, bullet lists, or small inline examples when useful. Favor lists and short blocks over dense text.`,
      wrapSource(clip(documentContent, 20000), 'DOCUMENT CONTEXT'),
    ]
      .filter(Boolean)
      .join('\n');

    // Streaming mode: return text/event-stream with incremental chunks
    const url = new URL(req.url);
    const doStream = url.searchParams.get('stream') === '1';
    // For testing slower models, extend request timeout at the route level
    // (maxDuration is already increased to 300s in module scope)
    if (doStream) {
      const encoder = new TextEncoder();
      let full = '';
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of streamTextChunks(
              prompt,
              preferredModel,
              systemMsg
            )) {
              const text = String(chunk || '');
              if (!text) continue;
              full = appendChunkSafely(full, text);
              // Emit each chunk immediately
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', delta: text })}\n\n`
                )
              );
            }
            let markdown = stripPreamble(full, {
              title: subtopic,
              lectureTitle,
            });
            // Normalize final combined output to enforce Markdown-only and escape stray angle brackets
            try {
              const { normalizeModelMarkdown } = await import(
                '@/lib/text/normalize-markdown'
              );
              markdown = normalizeModelMarkdown(markdown);
            } catch {}
            // Optional last-mile dedupe against prior sections
            try {
              if (coveragePack && coveragePack.recentFull.length) {
                const priors = coveragePack.recentFull.map((r) => r.text);
                const allPrior = priors.concat(
                  (coveragePack.priorGists || []).map((g) => g.gist)
                );
                const deduped = dedupeAgainstPrior(markdown, allPrior);
                if (deduped && deduped.trim()) markdown = deduped;
              }
            } catch {}
            // Persist best-effort
            if (subtopicIdIn && markdown) {
              try {
                await prisma.subtopic.update({
                  where: { id: subtopicIdIn },
                  data: { explanation: sanitizeDbText(markdown) },
                });
              } catch {}
            }
            const ms = Date.now() - t0;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'done',
                  debug: {
                    model: effectiveModel,
                    reasoningEffort: REASONING_EFFORT,
                    ms,
                  },
                })}\n\n`
              )
            );
            controller.close();
          } catch (e: any) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', error: e?.message || 'stream failed' })}\n\n`
              )
            );
            controller.close();
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'X-AI-Model': effectiveModel,
          'X-AI-Reasoning-Effort': REASONING_EFFORT,
        },
      });
    }

    // Non-streaming fallback
    const raw = await generateText(prompt, preferredModel, systemMsg);
    let markdown = stripPreamble(raw, { title: subtopic, lectureTitle });
    try {
      const { normalizeModelMarkdown } = await import(
        '@/lib/text/normalize-markdown'
      );
      markdown = normalizeModelMarkdown(markdown);
    } catch {}
    // Optional last-mile dedupe against prior sections
    try {
      if (coveragePack && coveragePack.recentFull.length) {
        const priors = coveragePack.recentFull.map((r) => r.text);
        const allPrior = priors.concat(
          (coveragePack.priorGists || []).map((g) => g.gist)
        );
        const deduped = dedupeAgainstPrior(markdown, allPrior);
        if (deduped && deduped.trim()) markdown = deduped;
      }
    } catch {}
    const ms = Date.now() - t0;

    log('OUT', { ok: !!markdown, chars: markdown.length, ms });

    if (!markdown) {
      return NextResponse.json({ error: 'empty' }, { status: 502 });
    }
    if (subtopicIdIn) {
      try {
        await prisma.subtopic.update({
          where: { id: subtopicIdIn },
          data: { explanation: sanitizeDbText(markdown) },
        });
      } catch {}
    }
    return NextResponse.json(
      {
        markdown,
        explanation: markdown,
        debug: {
          model: effectiveModel,
          reasoningEffort: REASONING_EFFORT,
          ms,
        },
      },
      {
        headers: {
          'X-AI-Model': effectiveModel,
          'X-AI-Reasoning-Effort': REASONING_EFFORT,
          'X-Response-Time-Ms': String(ms),
        },
      }
    );
  } catch (e: any) {
    const ms = Date.now() - t0;
    err('ERR', { ms, message: e?.message });
    return NextResponse.json(
      { error: e?.message || 'internal error' },
      { status: 500 }
    );
  }
}
