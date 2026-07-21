import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import pdf from 'pdf-extraction';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import {
  generateJSON,
  generateJSONFromPdf,
  generateText,
  PRIMARY_MODEL,
} from '@/lib/ai';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';
import {
  buildBreakdownPrompt,
  buildPdfBreakdownPrompt,
  MARKDOWN_STYLE_RULES,
  SOURCE_HANDLING_RULES,
  wrapSource,
} from '@/lib/ai-prompts';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 60;
const DEFAULT_TITLE = 'Generating lesson... Please Wait';
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_CHARS = 250_000;

function isAllowedBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.public.blob.vercel-storage.com')
    );
  } catch {
    return false;
  }
}

type BreakdownSubtopic = {
  title: string;
  importance: string; // 'high' | 'medium' | 'low'
  difficulty: number; // 1..3
  overview?: string;
};
type Breakdown = {
  topic: string;
  subtopics: BreakdownSubtopic[];
};

type QuizQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  subtopicTitle?: string;
};

// --- Helpers: shape guards & fallbacks --------------------------------------

function sanitizeDbText(s: string): string {
  // Postgres TEXT cannot contain NUL (0x00). Remove any null bytes.
  return (s || '').replace(/\u0000/g, '');
}

function normalizeExtractedText(s: string): string {
  const collapsed = (s || '').replace(/\s{2,}/g, ' ').trim();
  return sanitizeDbText(collapsed);
}

/**
 * Extract text from a PDF buffer while suppressing noisy console warnings from
 * the PDF parser (e.g., TrueType interpreter "TT: undefined function: 21") and
 * Node's global Buffer() deprecation notice from transitive deps. This keeps
 * server logs clean without muting unrelated warnings.
 */
async function extractPdfTextQuiet(
  buf: Buffer
): Promise<{ text: string; pages: number }> {
  const originalWarn = console.warn;
  const originalEmitWarning = process.emitWarning;
  try {
    // Suppress specific pdf.js TrueType warnings
    console.warn = ((...args: any[]) => {
      try {
        const first = args?.[0] ? String(args[0]) : '';
        if (first.includes('TT: undefined function')) return;
      } catch {}
      return (originalWarn as any).apply(console, args as any);
    }) as any;
    // Suppress Buffer() global deprecation warning from transitive libs
    process.emitWarning = ((warning: any, ...rest: any[]) => {
      try {
        const code = typeof warning === 'string' ? rest?.[1] : warning?.code;
        const message =
          typeof warning === 'string' ? warning : warning?.message || '';
        if (
          code === 'DEP0005' ||
          String(message).includes('Buffer() is deprecated')
        ) {
          return;
        }
      } catch {}
      return (originalEmitWarning as any).call(process, warning, ...rest);
    }) as any;
    const data: any = await pdf(buf as any);
    const pages = Number(data?.numpages || 0) || 0;
    const text = normalizeExtractedText(String(data?.text || ''));
    return { text, pages };
  } finally {
    console.warn = originalWarn;
    process.emitWarning = originalEmitWarning as any;
  }
}

function normImportance(v: unknown): 'high' | 'medium' | 'low' {
  const s = String(v || '').toLowerCase();
  return s === 'high' || s === 'low' ? (s as any) : 'medium';
}
function clampDifficulty(v: unknown): 1 | 2 | 3 {
  const n = Number(v);
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}
function clip(s: string, max = 240): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function sanitizeBreakdown(raw: any, text: string): Breakdown {
  const topic =
    typeof raw?.topic === 'string' && raw.topic.trim()
      ? raw.topic.trim()
      : DEFAULT_TITLE;

  let subs: BreakdownSubtopic[] = [];
  if (Array.isArray(raw?.subtopics)) {
    subs = raw.subtopics
      .map((s: any) => {
        const title =
          typeof s?.title === 'string' && s.title.trim() ? s.title.trim() : '';
        if (!title) return null;
        return {
          title,
          importance: normImportance(s?.importance),
          difficulty: clampDifficulty(s?.difficulty),
          overview:
            typeof s?.overview === 'string' && s.overview.trim()
              ? clip(s.overview, 500)
              : undefined,
        } as BreakdownSubtopic;
      })
      .filter(Boolean) as BreakdownSubtopic[];
  }

  // Fallback: at least one subtopic
  if (subs.length === 0) {
    const firstChunk = clip(text, 500);
    subs = [
      {
        title: topic !== DEFAULT_TITLE ? `${topic} — Overview` : 'Overview',
        importance: 'high',
        difficulty: 1,
        overview: firstChunk || 'Overview of the provided content.',
      },
    ];
  }

  return { topic, subtopics: subs };
}

function isGoodQuestion(q: any): q is QuizQuestion {
  return (
    q &&
    typeof q.prompt === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    typeof q.answerIndex === 'number' &&
    q.answerIndex >= 0 &&
    q.answerIndex < 4 &&
    typeof q.explanation === 'string'
  );
}

function shuffleOptionsWithAnswer(
  options: string[],
  answerIndex: number
): { options: string[]; answerIndex: number } {
  const pairs = options.map((opt, idx) => ({ opt, idx }));
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  const newOptions = pairs.map((p) => p.opt);
  const newAnswerIndex = pairs.findIndex((p) => p.idx === answerIndex);
  return { options: newOptions, answerIndex: newAnswerIndex };
}

// Note: All quiz fallbacks removed. If generation fails, we leave the subtopic without questions.

async function selectTopSubtopics(
  subtopics: BreakdownSubtopic[],
  preferredModel: string | undefined,
  maxCount: number
): Promise<BreakdownSubtopic[]> {
  if (subtopics.length <= maxCount) return subtopics;
  const payload = subtopics.map((s, idx) => ({
    index: idx,
    title: s.title,
    overview: s.overview || '',
  }));
  const prompt = `
You are helping design a concise lecture from a larger document.

Below is an ORDERED list of candidate subtopics extracted from the ENTIRE document (from start to end). Choose exactly ${maxCount} indices that:
- Maximize total coverage of the entire document (include early, middle, and late content)
- Favor information-dense and foundational concepts
- Avoid redundancy; aim for diverse topics that together cover the most material

Return ONLY JSON of the form: { "indices": [i0, i1, ...] }
Use 0-based indices, all unique, length exactly ${maxCount}.

CANDIDATES:
${JSON.stringify(payload, null, 2)}
`;
  try {
    const out = await generateJSON(prompt);
    const indices: number[] = Array.isArray(out?.indices)
      ? out.indices
          .map((n: any) => Number(n))
          .filter(
            (n: any) => Number.isInteger(n) && n >= 0 && n < subtopics.length
          )
      : [];
    const uniq = Array.from(new Set(indices)).slice(0, maxCount);
    if (uniq.length === 0) throw new Error('no indices');
    // Preserve original document order by sorting selected indices ascending
    uniq.sort((a, b) => a - b);
    return uniq.map((i) => subtopics[i]);
  } catch {
    // Fallback: spread picks across the array for coverage
    const step = subtopics.length / maxCount;
    const picks: number[] = [];
    for (let k = 0; k < maxCount; k++) picks.push(Math.floor(k * step));
    const uniq = Array.from(new Set(picks)).slice(0, maxCount);
    return uniq.map((i) => subtopics[i]).filter(Boolean);
  }
}

async function generateSectionMarkdowns(
  lectureTitle: string,
  allText: string,
  subtopics: BreakdownSubtopic[],
  preferredModel?: string
): Promise<Record<string, string>> {
  const clip = (s: string, max = 10000) => {
    const t = (s || '').trim();
    return t.length > max ? t.slice(0, max) : t;
  };
  // Lightweight relevancy selection to shrink context per subtopic
  const STOP = new Set(
    'the,be,to,of,and,a,in,that,have,i,it,for,not,on,with,he,as,you,do,at,by,from,or,an,are,is,was,were,which,one,all,this,can,will,if,about,into,than,then,there,also,other,more,most,each'.split(
      ','
    )
  );
  const tokenize = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && w.length >= 3 && !STOP.has(w));
  const paragraphs = (allText || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const selectRelevantContext = (
    title: string,
    overview: string,
    maxChars = 4000
  ): string => {
    if (!paragraphs.length) return clip(allText, maxChars);
    const queryTerms = new Set([...tokenize(title), ...tokenize(overview)]);
    if (queryTerms.size === 0) return clip(allText, maxChars);
    const scores: Array<{ idx: number; score: number; text: string }> = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const toks = tokenize(p);
      let sc = 0;
      for (const t of toks) if (queryTerms.has(t)) sc++;
      // small bonus for adjacency to previous relevant paragraph
      if (sc && i > 0) {
        const prevToks = tokenize(paragraphs[i - 1]);
        for (const t of prevToks)
          if (queryTerms.has(t)) {
            sc += 0.3;
            break;
          }
      }
      if (sc > 0) scores.push({ idx: i, score: sc, text: p });
    }
    if (!scores.length) return clip(allText, maxChars);
    scores.sort((a, b) => b.score - a.score);
    const picked: string[] = [];
    const used = new Set<number>();
    let total = 0;
    for (const s of scores) {
      if (used.has(s.idx)) continue;
      const chunkParts: string[] = [];
      // include prev, current, next for continuity
      for (const j of [s.idx - 1, s.idx, s.idx + 1]) {
        if (j >= 0 && j < paragraphs.length && !used.has(j)) {
          const part = paragraphs[j];
          const addLen = part.length + 2;
          if (total + addLen > maxChars && picked.length) break;
          used.add(j);
          chunkParts.push(part);
          total += addLen;
        }
      }
      if (chunkParts.length) picked.push(chunkParts.join('\n\n'));
      if (total >= maxChars) break;
    }
    return picked.join('\n\n\n');
  };
  // Run subtopics with a bounded concurrency for better latency and fewer throttles
  const limit = Math.max(1, Number(process.env.AI_SECTION_CONCURRENCY || '4'));
  let inFlight = 0;
  const queue: Array<() => Promise<void>> = [];
  const result: Record<string, string> = {};

  const runNext = async (): Promise<void> => {
    if (!queue.length) return;
    if (inFlight >= limit) return;
    const task = queue.shift()!;
    inFlight++;
    try {
      await task();
    } finally {
      inFlight--;
      await runNext();
    }
  };

  const tasks = subtopics.map((s) => async () => {
    const systemMsg = [
      'You are writing one focused section of a lesson.',
      SOURCE_HANDLING_RULES,
      'Teach the idea accurately and directly without a preamble or meta commentary.',
      MARKDOWN_STYLE_RULES,
    ].join(' ');
    const title = s.title;
    const overview = s.overview || '';
    const prompt = [
      `Lecture: "${lectureTitle}"`,
      `Subtopic: "${title}"`,
      `Overview: ${overview}`,
      'Write 140-220 words. Start with the core idea, explain why it works or matters, and include one compact example only when the source supports it.',
      'Prefer plain language. Define unavoidable jargon at first use. Do not add an H1 or repeat the section title.',
      wrapSource(
        selectRelevantContext(
          title,
          overview,
          Math.max(1000, Number(process.env.AI_SECTION_CONTEXT_CHARS || '2400'))
        ),
        'RELEVANT SOURCE EXCERPTS'
      ),
    ].join('\n');
    const mdRaw = await generateText(prompt, preferredModel, systemMsg);
    // Normalize to ensure clean Markdown and escape stray angle brackets
    try {
      const { normalizeModelMarkdown } = await import(
        '@/lib/text/normalize-markdown'
      );
      const normalized = normalizeModelMarkdown(mdRaw);
      result[title.trim().toLowerCase()] = sanitizeDbText(normalized);
    } catch {
      result[title.trim().toLowerCase()] = sanitizeDbText(mdRaw);
    }
  });

  // Enqueue tasks and run with concurrency
  for (const t of tasks) {
    queue.push(t);
    void runNext();
  }
  // Wait for all to finish
  while (queue.length || inFlight) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return result;
}

// --- Route -------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;
    const limit = rateLimit(
      rateLimitKey(req, 'lecture-creation', userId),
      8,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many lesson requests. Please wait and try again.' },
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

    const contentType = req.headers.get('content-type') || '';
    let text = '';
    // Keep a copy of the raw PDF bytes when available so we can extract text
    // as a reliable fallback (and to ground chat later).
    let pdfBuffer: Buffer | null = null;

    // Ignore client-selected model for lecture generation; use server-side defaults
    const preferredModel: string | undefined = undefined;
    let wasPlainTextInput = false;
    // If true, we will create a minimal lecture and allow the client to stream
    // subtopics later instead of doing heavy breakdown work inline.
    let shouldDeferBreakdown = false;
    let visionCandidate: File | null = null;
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'No file provided. Please upload a single PDF.' },
          { status: 400 }
        );
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json(
          { error: 'Invalid file type. Only PDF files are accepted.' },
          { status: 400 }
        );
      }
      if (file.size > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: 'PDF is too large. The maximum file size is 20 MB.' },
          { status: 413 }
        );
      }
      // Prefer Vision first for PDFs; keep file for later
      visionCandidate = file as File;
      try {
        const arr = await (file as File).arrayBuffer();
        pdfBuffer = Buffer.from(arr);
      } catch {}
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      const content = String(body?.content || '').trim();
      const single = String(body?.blobUrl || '').trim();
      const blobUrls: string[] = Array.isArray(body?.blobUrls)
        ? (body.blobUrls as any[])
            .map((u) => String(u || '').trim())
            .filter(Boolean)
            .slice(0, 5)
        : single
          ? [single]
          : [];

      if (content.length > 100_000) {
        return NextResponse.json(
          { error: 'Notes are too long. Keep them under 100,000 characters.' },
          { status: 413 }
        );
      }

      if (blobUrls.length > 0) {
        // Fetch and extract text from each PDF. If extraction fails for a single-PDF case, try vision.
        const buffers: Buffer[] = [];
        for (const url of blobUrls) {
          if (!isAllowedBlobUrl(url)) {
            return NextResponse.json(
              { error: 'Invalid PDF upload URL.' },
              { status: 400 }
            );
          }
          const resp = await fetch(url);
          if (!resp.ok) {
            return NextResponse.json(
              { error: `Could not fetch blob: ${url}` },
              { status: 400 }
            );
          }
          const arr = Buffer.from(await resp.arrayBuffer());
          if (arr.byteLength > MAX_PDF_BYTES) {
            return NextResponse.json(
              { error: 'PDF is too large. The maximum file size is 20 MB.' },
              { status: 413 }
            );
          }
          buffers.push(arr);
        }

        const extractedPieces: string[] = [];
        for (const buf of buffers) {
          try {
            const { text: piece } = await extractPdfTextQuiet(buf);
            if (piece) extractedPieces.push(piece);
          } catch {
            // continue; we'll try vision below if single
          }
        }
        const joined = extractedPieces.join('\n\n-----\n\n');
        const userContext = sanitizeDbText(content);
        if (joined && userContext) {
          text = `${userContext}\n\n-----\n\n${joined}`;
        } else if (joined) {
          text = joined;
        } else if (userContext) {
          // No extractable text, but user provided context
          text = userContext;
        } else if (blobUrls.length === 1) {
          // Try vision when there is exactly one PDF and no extracted text
          const arr = buffers[0];
          pdfBuffer = arr;
          const arr8 = new Uint8Array(arr);
          visionCandidate = new File([arr8], 'upload.pdf', {
            type: 'application/pdf',
          }) as any;
        } else {
          // Multiple PDFs and none extractable
          return NextResponse.json(
            {
              error:
                'Could not extract text from the PDFs. They may only contain images. Try uploading a single PDF or add context.',
            },
            { status: 422 }
          );
        }
        // Defer breakdown when PDFs were provided and we have some text
        // so the client can use the streaming endpoint.
        if (text) {
          shouldDeferBreakdown = true;
        }
      } else {
        // No PDFs, just text content
        text = sanitizeDbText(content);
        if (!text)
          return NextResponse.json(
            { error: 'Content is required.' },
            { status: 400 }
          );
        wasPlainTextInput = true;
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported content type.' },
        { status: 415 }
      );
    }

    // Try to extract text from PDF first (preferred grounding for large PDFs)
    if (!text && pdfBuffer) {
      try {
        const { text: extracted } = await extractPdfTextQuiet(pdfBuffer);
        if (extracted) text = extracted;
      } catch {}
    }

    if (text.length > MAX_SOURCE_CHARS) {
      text = text.slice(0, MAX_SOURCE_CHARS);
    }

    // EARLY RETURN for immediate navigation:
    // If this was plain text input, create a lecture record immediately and return.
    if (wasPlainTextInput) {
      const lecture = await prisma.lecture.create({
        data: {
          title: DEFAULT_TITLE,
          originalContent: sanitizeDbText(text),
          userId,
          lastOpenedAt: new Date(),
        },
      });
      // Lifetime: increment created counter (do not decrement on deletes)
      try {
        await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = "lifetimeLecturesCreated" + 1 WHERE "id" = ${userId}`;
      } catch {}
      try {
        await bumpDailyStreak(userId);
      } catch {}
      // Ensure dashboard caches reflect the new lecture immediately
      try {
        revalidateTag(`user-lectures:${userId}`);
      } catch {}
      try {
        revalidateTag(`user-stats:${userId}`);
      } catch {}
      return NextResponse.json(
        {
          lectureId: lecture.id,
          debug: {
            model: PRIMARY_MODEL,
            immediate: true,
          },
        },
        { status: 201 }
      );
    }

    // Optional: vision path when OCR/text extraction is thin
    if (!text && visionCandidate) {
      try {
        const buf =
          pdfBuffer || Buffer.from(await visionCandidate.arrayBuffer());
        const visionPrompt = buildPdfBreakdownPrompt();
        const parsed = await generateJSONFromPdf(
          buf,
          (visionCandidate as File).name || 'upload.pdf',
          visionPrompt
        );
        // Use parsed results as breakdown
        const bdFromVision = {
          topic: String(parsed?.topic || 'Untitled'),
          subtopics: Array.isArray(parsed?.subtopics)
            ? parsed.subtopics.map((s: any) => ({
                title: String(s?.title || ''),
                importance: String(s?.importance || 'medium'),
                difficulty: Number(s?.difficulty || 2),
                overview: String(s?.overview || ''),
              }))
            : [],
        } as Breakdown;
        // Extract raw text (best-effort) for grounding chat/originalContent
        let extracted = '';
        try {
          const { text: t } = await extractPdfTextQuiet(
            (pdfBuffer || buf) as Buffer
          );
          extracted = t;
        } catch {}
        // Merge any user-provided content with extracted text for grounding
        const userContext = text ? sanitizeDbText(text) : '';
        const merged = userContext
          ? userContext && extracted
            ? `${userContext}\n\n-----\n\n${extracted}`
            : userContext || extracted
          : extracted;
        // 3) Persist directly, storing extracted text when available
        const originalContent = merged || 'PDF (vision) upload';
        const lecture = await prisma.lecture.create({
          data: {
            title: bdFromVision.topic || DEFAULT_TITLE,
            originalContent: sanitizeDbText(originalContent),
            userId,
          },
        });
        try {
          await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = "lifetimeLecturesCreated" + 1 WHERE "id" = ${userId}`;
        } catch {}
        // Count lecture generation towards streak
        await bumpDailyStreak(userId);
        // Defer all subtopic + quiz generation to streaming path
        // Ensure dashboard caches reflect the new lecture immediately
        try {
          revalidateTag(`user-lectures:${userId}`);
        } catch {}
        try {
          revalidateTag(`user-stats:${userId}`);
        } catch {}
        return NextResponse.json(
          {
            lectureId: lecture.id,
            debug: {
              model: PRIMARY_MODEL,
              usedVision: true,
            },
          },
          { status: 201 }
        );
      } catch {
        // If vision fails, continue to text-only path
      }
    }

    // If we received PDFs via blobUrls and extracted usable text, defer
    // breakdown/subtopic generation to the streaming endpoint.
    if (shouldDeferBreakdown && text) {
      const originalContent = sanitizeDbText(text);
      const lecture = await prisma.lecture.create({
        data: {
          title: DEFAULT_TITLE,
          originalContent,
          userId,
          lastOpenedAt: new Date(),
        },
      });
      try {
        await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = "lifetimeLecturesCreated" + 1 WHERE "id" = ${userId}`;
      } catch {}
      try {
        await bumpDailyStreak(userId);
      } catch {}
      try {
        revalidateTag(`user-lectures:${userId}`);
      } catch {}
      try {
        revalidateTag(`user-stats:${userId}`);
      } catch {}
      return NextResponse.json(
        {
          lectureId: lecture.id,
          debug: {
            model: PRIMARY_MODEL,
            deferred: true,
          },
        },
        { status: 201 }
      );
    }

    // If we still have no text but we do have the PDF bytes, extract text now.
    if (!text && pdfBuffer) {
      try {
        const { text: extracted } = await extractPdfTextQuiet(pdfBuffer);
        text = extracted;
      } catch {}
    }
    // EARLY RETURN for PDF uploads as well: create minimal lecture and allow client to stream subtopics.
    if (pdfBuffer) {
      const originalContent = sanitizeDbText(text || 'PDF upload');
      const lecture = await prisma.lecture.create({
        data: {
          title: DEFAULT_TITLE,
          originalContent,
          userId,
          lastOpenedAt: new Date(),
        },
      });
      try {
        await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = "lifetimeLecturesCreated" + 1 WHERE "id" = ${userId}`;
      } catch {}
      try {
        await bumpDailyStreak(userId);
      } catch {}
      // Ensure dashboard caches reflect the new lecture immediately
      try {
        revalidateTag(`user-lectures:${userId}`);
      } catch {}
      try {
        revalidateTag(`user-stats:${userId}`);
      } catch {}
      return NextResponse.json(
        {
          lectureId: lecture.id,
          debug: {
            model: PRIMARY_MODEL,
            immediate: true,
          },
        },
        { status: 201 }
      );
    }
    if (!text) {
      return NextResponse.json(
        {
          error:
            'Could not extract text from the PDF. The file may only contain images.',
        },
        { status: 422 }
      );
    }

    // 1) Breakdown (robust)
    const breakdownPrompt = buildBreakdownPrompt(text);
    const t0 = Date.now();
    const bdRaw = await generateJSON(breakdownPrompt);
    let bd = sanitizeBreakdown(bdRaw, text);
    // Select coverage-maximizing subtopics up to cap
    const MAX_SUBTOPICS = 12;
    if (bd.subtopics.length > MAX_SUBTOPICS) {
      const picked = await selectTopSubtopics(
        bd.subtopics,
        preferredModel,
        MAX_SUBTOPICS
      );
      bd = { ...bd, subtopics: picked };
    }

    // 2) Quiz (robust) — generate only for FIRST subtopic to speed up
    const firstSub = bd.subtopics[0];
    const quizPromptFirst = `
      You are an expert assessment writer. Create exactly TWO multiple-choice questions grounded ONLY in the DOCUMENT CONTENT below for the subtopic shown.

      Constraints:
      - Use only facts present in the document. Do not invent.
      - Questions must match the scope of the subtopic overview.
      - Include a short DIRECT quote (6–12 words) from the document in the explanation, in "double quotes".
      - Exactly four options ["A","B","C","D"]. No prefixes.
      - Exactly ONE correct option per question; the other three must be clearly incorrect given the DOCUMENT.
      - Avoid ambiguous options and avoid "All/None of the above".

      Return ONLY ONE JSON object:
      {
        "questions": [
          { "prompt": "string", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "string", "subtopicTitle": "${firstSub?.title || ''}" },
          { "prompt": "string", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "string", "subtopicTitle": "${firstSub?.title || ''}" }
        ]
      }

      DOCUMENT CONTENT (truncated for safety):
      ${clip(text, 6000)}

      SUBTOPIC:
      ${JSON.stringify({ title: firstSub?.title, overview: firstSub?.overview || '' }, null, 2)}
    `.trim();
    const mid = Date.now();
    const modelForQuiz = PRIMARY_MODEL;
    const qzRaw = await generateJSON(quizPromptFirst, modelForQuiz);
    const msBreakdown = mid - t0;
    const msQuiz = Date.now() - mid;
    let rawQuestions: QuizQuestion[] = Array.isArray(qzRaw?.questions)
      ? (qzRaw.questions as any[]).filter(isGoodQuestion)
      : [];
    // De-duplicate by prompt in case upstream returned duplicates
    const seen = new Set<string>();
    rawQuestions = rawQuestions
      .filter((q) => {
        const p = String(q.prompt || '').trim();
        if (!p || seen.has(p)) return false;
        seen.add(p);
        return true;
      })
      .map((q) => {
        const sh = shuffleOptionsWithAnswer(q.options, q.answerIndex);
        return { ...q, options: sh.options, answerIndex: sh.answerIndex };
      });

    // 3) Persist (non-interactive writes to avoid long-lived transaction issues)
    const lecture = await prisma.lecture.create({
      data: {
        title: bd.topic || DEFAULT_TITLE,
        originalContent: sanitizeDbText(text),
        userId,
        lastOpenedAt: new Date(),
      },
    });
    try {
      await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = "lifetimeLecturesCreated" + 1 WHERE "id" = ${userId}`;
    } catch {}
    // Count lecture generation towards streak
    await bumpDailyStreak(userId);

    // Generate explanation for FIRST subtopic only; others deferred until viewed
    const titleForLecture = bd.topic || DEFAULT_TITLE;
    const firstOnly = bd.subtopics.slice(0, 1);
    const sectionMap = await generateSectionMarkdowns(
      titleForLecture,
      text,
      firstOnly,
      preferredModel
    );

    // Insert subtopics with only first explanation persisted
    await prisma.subtopic.createMany({
      data: bd.subtopics.map((s, idx) => ({
        order: idx,
        title: s.title,
        importance: s.importance,
        difficulty: s.difficulty,
        overview: s.overview || '',
        explanation:
          idx === 0 ? sectionMap[s.title.trim().toLowerCase()] || null : null,
        lectureId: lecture.id,
      })),
    });

    // Fetch inserted subtopics (ordered) and align questions by index for stable mapping (2 per subtopic)
    const subtopics = await prisma.subtopic.findMany({
      where: { lectureId: lecture.id },
      orderBy: { order: 'asc' },
      select: { id: true, title: true },
    });
    const quizData: Array<{
      prompt: string;
      options: any;
      answerIndex: number;
      explanation: string;
      subtopicId: string;
    }> = [];
    if (subtopics.length > 0) {
      const st = subtopics[0];
      const q1 = rawQuestions[0];
      const q2 = rawQuestions[1];
      if (isGoodQuestion(q1) && isGoodQuestion(q2)) {
        quizData.push(
          {
            prompt: q1.prompt,
            options: q1.options as any,
            answerIndex: q1.answerIndex,
            explanation: q1.explanation,
            subtopicId: st.id,
          },
          {
            prompt: q2.prompt,
            options: q2.options as any,
            answerIndex: q2.answerIndex,
            explanation: q2.explanation,
            subtopicId: st.id,
          }
        );
      } else {
        // Do not insert fallback questions; leave first subtopic without questions
      }
    }
    if (quizData.length) {
      try {
        await prisma.quizQuestion.createMany({
          data: quizData,
          skipDuplicates: true,
        });
      } catch {}
    }

    // Ensure dashboard caches reflect the new lecture immediately
    try {
      revalidateTag(`user-lectures:${userId}`);
    } catch {}
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json(
      {
        lectureId: lecture.id,
        debug: {
          model: PRIMARY_MODEL,
          msBreakdown,
          msQuiz,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error('LECTURES_API_ERROR:', e?.stack || e?.message || e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
