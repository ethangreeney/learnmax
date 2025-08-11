// src/app/api/explain-db/route.ts
import { NextResponse } from 'next/server';
import { generateText, PRIMARY_MODEL, streamTextChunks } from '@/lib/ai';
import prisma from '@/lib/prisma';

const L = process.env.LOG_EXPLAIN === '1';
const log = (...a: any[]) => {
  if (L) console.log('[explain-db]', ...a);
};
const err = (...a: any[]) => {
  if (L) console.error('[explain-db]', ...a);
};

type StripOpts = { title?: string; isChunk?: boolean };

function stripPreamble(md: string, opts?: StripOpts): string {
  // Avoid trimming for streaming chunks to prevent word concatenation across boundaries
  let out = String(md ?? '');

  // Common filler/preamble phrases at the start
  out = out.replace(
    /^(?:\s*)(of course|sure\,?|here (?:is|are)|crafting learning module\.\.\.)[^\n]*\n*/i,
    ''
  );

  // Drop leading ATX headings (H1–H6)
  out = out.replace(/^\s{0,3}#{1,6}\s+[^\n]+\n+/m, '');

  // Drop leading setext headings (Title\n==== or ----)
  out = out.replace(/^\s*([^\n]+)\n(?:=+|-+)\s*\n+/m, '');

  // If first non-empty line equals the provided title, remove it
  if (opts?.title) {
    const lines = out.split('\n');
    const firstIdx = lines.findIndex((l) => l.trim() !== '');
    if (firstIdx !== -1) {
      const firstLine = lines[firstIdx].trim();
      if (
        firstLine.localeCompare(opts.title.trim(), undefined, {
          sensitivity: 'accent',
        }) === 0
      ) {
        lines.splice(firstIdx, 1);
        out = lines.join('\n');
      }
    }
  }

  // Drop generic disclaimers about context/section anywhere in the first few short paragraphs
  let paras = out.split(/\n{2,}/);
  if (paras.length) {
    const preambleRe =
      /\b(document\s+context|provided\s+context|limited\s+context|insufficient\s+context|lack\s+of\s+context|not\s+enough\s+context|context\s+alone|based\s+on\s+the\s+provided\s+(document|context)|this\s+(section|explanation)\s+will|in\s+this\s+(section|lesson)|overview\s+of)\b/i;
    paras = paras.filter((p, idx) => {
      const trimmed = p.trim();
      // Filter out short meta paragraphs that look like disclaimers/preambles
      if (trimmed.length <= 500 && preambleRe.test(trimmed)) return false;
      return true;
    });
    out = paras.join('\n\n');
  }

  if (!opts?.isChunk) out = out.trim();
  return out;
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

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
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
    let documentContent = '';
    if (lectureIdIn) {
      try {
        const lecture = await prisma.lecture.findUnique({
          where: { id: lectureIdIn },
          select: { originalContent: true },
        });
        documentContent = lecture?.originalContent || '';
      } catch {}
    }
    if (!documentContent && docIn) documentContent = docIn;
    documentContent = sanitizeDbText(documentContent);
    // Clip to keep prompts manageable
    const clip = (s: string, max = 20000) => {
      const t = (s || '').trim();
      return t.length > max ? t.slice(0, max) : t;
    };

    const prompt = [
      `You are writing ONE section of an in-progress lecture.`,
      `Lecture title: "${lectureTitle}"`,
      `Subtopic: "${subtopic}"`,
      `Style: ${styleHint}`,
      coveredList.length
        ? `Previously covered subtopics (avoid repeating their content; build upon them where natural):\n${JSON.stringify(coveredList, null, 2)}`
        : '',
      `Ground your explanation STRICTLY in the DOCUMENT CONTEXT below when relevant. If the context is missing or does not cover the subtopic, provide a concise, generally valid explanation of the subtopic without inventing document-specific details.`,
      `Write 300–600 words of clean Markdown.`,
      `Start directly with content. No preamble (e.g., "Of course", "Here is", etc.). Do NOT mention the words "document", "context", "provided context", "this section", or any limitations. No meta commentary or disclaimers.`,
      `Do NOT number subtopics. Do NOT add a standalone H1.`,
      `Keep the tone concise and instructional; use short paragraphs, bullet lists, or small inline examples when useful.`,
      `---`,
      `DOCUMENT CONTEXT (may be truncated):`,
      clip(documentContent, 20000),
    ].join('\n');

    // Streaming mode: return text/event-stream with incremental chunks
    const url = new URL(req.url);
    const doStream = url.searchParams.get('stream') === '1';
    if (doStream) {
      const encoder = new TextEncoder();
      let full = '';
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of streamTextChunks(
              prompt,
              preferredModel
            )) {
              const clean = stripPreamble(chunk, {
                title: subtopic,
                isChunk: true,
              });
              full = appendChunkSafely(full, clean);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', delta: clean })}\n\n`
                )
              );
            }
            const markdown = stripPreamble(full, { title: subtopic });
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
                `data: ${JSON.stringify({ type: 'done', debug: { model: effectiveModel, ms } })}\n\n`
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
        },
      });
    }

    // Non-streaming fallback
    const raw = await generateText(prompt, preferredModel);
    const markdown = stripPreamble(raw, { title: subtopic });
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
    return NextResponse.json({
      markdown,
      explanation: markdown,
      debug: { model: effectiveModel, ms },
    });
  } catch (e: any) {
    const ms = Date.now() - t0;
    err('ERR', { ms, message: e?.message });
    return NextResponse.json(
      { error: e?.message || 'internal error' },
      { status: 500 }
    );
  }
}
