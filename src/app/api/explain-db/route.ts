// src/app/api/explain-db/route.ts
import { NextResponse } from 'next/server';
import { generateText, PRIMARY_MODEL } from '@/lib/ai';
import prisma from '@/lib/prisma';

const L = process.env.LOG_EXPLAIN === '1';
const log = (...a: any[]) => { if (L) console.log('[explain-db]', ...a); };
const err = (...a: any[]) => { if (L) console.error('[explain-db]', ...a); };

function stripPreamble(md: string): string {
  let out = (md || '').trim();
  out = out.replace(/^(of course|sure\,?|here (?:is|are)|crafting learning module\.\.\.)[^\n]*\n*/i, '');
  out = out.replace(/^# .+\n+/m, ''); // drop leading H1 if any
  return out.trim() || (md || '').trim();
}

  function sanitizeDbText(s: string): string {
    return (s || '').replace(/\u0000/g, '');
  }

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({} as any));
    const subtopicIn = typeof body?.subtopic === 'string' ? body.subtopic.trim() : '';
    const lectureIdIn = typeof body?.lectureId === 'string' ? body.lectureId.trim() : '';
    const docIn = typeof body?.documentContent === 'string' ? body.documentContent : '';
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

    const subtopic = subtopicIn || 'Overview';
    const lectureTitle = titleIn;

    const styleHint =
      styleIn === 'simplified' ? 'Explain as simply as possible for a beginner.'
      : styleIn === 'detailed' ? 'Go a bit deeper on nuances and edge cases.'
      : styleIn === 'example' ? 'Center the explanation around a concrete, realistic example.'
      : 'Use a balanced, concise explanation.';

    const preferredModel = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
    const effectiveModel = preferredModel || PRIMARY_MODEL;
    log('IN', { lectureTitle, subtopic, style: styleIn, model: effectiveModel });

    // Resolve document content for grounding
    let documentContent = '';
    if (lectureIdIn) {
      try {
        const lecture = await prisma.lecture.findUnique({ where: { id: lectureIdIn }, select: { originalContent: true } });
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
      `Ground your explanation STRICTLY in the DOCUMENT CONTEXT below when relevant. If the context is missing or does not cover the subtopic, say so briefly and provide a best-effort general explanation without inventing specifics from the document.`,
      `Write 300–600 words of clean Markdown.`,
      `Start directly with content. No preamble (e.g., "Of course", "Here is", etc.).`,
      `Do NOT number subtopics. Do NOT add a standalone H1.`,
      `Keep the tone concise and instructional; use short paragraphs, bullet lists, or small inline examples when useful.`,
      `---`,
      `DOCUMENT CONTEXT (may be truncated):`,
      clip(documentContent, 20000),
    ].join('\n');

    const raw = await generateText(prompt, preferredModel);
    const markdown = stripPreamble(raw);
    const ms = Date.now() - t0;

    log('OUT', { ok: !!markdown, chars: markdown.length, ms });

    if (!markdown) {
      return NextResponse.json({ error: 'empty' }, { status: 502 });
    }
    // Return both keys so callers can pick either, plus light debug info.
    return NextResponse.json({ markdown, explanation: markdown, debug: { model: effectiveModel, ms } });
  } catch (e: any) {
    const ms = Date.now() - t0;
    err('ERR', { ms, message: e?.message });
    return NextResponse.json(
      { error: e?.message || 'internal error' },
      { status: 500 },
    );
  }
}
