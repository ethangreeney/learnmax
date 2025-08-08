// src/app/api/explain-db/route.ts
import { NextResponse } from 'next/server';
import { generateText, PRIMARY_MODEL } from '@/lib/ai';

const L = process.env.LOG_EXPLAIN === '1';
const log = (...a: any[]) => { if (L) console.log('[explain-db]', ...a); };
const err = (...a: any[]) => { if (L) console.error('[explain-db]', ...a); };

function stripPreamble(md: string): string {
  let out = (md || '').trim();
  out = out.replace(/^(of course|sure\,?|here (?:is|are)|crafting learning module\.\.\.)[^\n]*\n*/i, '');
  out = out.replace(/^# .+\n+/m, ''); // drop leading H1 if any
  return out.trim() || (md || '').trim();
}

export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({} as any));
    const subtopicIn = typeof body?.subtopic === 'string' ? body.subtopic.trim() : '';
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

    log('IN', { lectureTitle, subtopic, style: styleIn, model: PRIMARY_MODEL });

    const prompt = [
      `You are writing ONE section of an in-progress lecture.`,
      `Lecture title: "${lectureTitle}"`,
      `Subtopic: "${subtopic}"`,
      `Style: ${styleHint}`,
      `Write 300–600 words of clean Markdown.`,
      `Start directly with content. No preamble (e.g., "Of course", "Here is", etc.).`,
      `Do NOT number subtopics. Do NOT add a standalone H1.`,
      `Keep the tone concise and instructional; use short paragraphs, bullet lists, or small inline examples when useful.`,
    ].join('\n');

    const raw = await generateText(prompt);
    const markdown = stripPreamble(raw);
    const ms = Date.now() - t0;

    log('OUT', { ok: !!markdown, chars: markdown.length, ms });

    if (!markdown) {
      return NextResponse.json({ error: 'empty' }, { status: 502 });
    }
    // Return both keys so callers can pick either.
    return NextResponse.json({ markdown, explanation: markdown });
  } catch (e: any) {
    const ms = Date.now() - t0;
    err('ERR', { ms, message: e?.message });
    return NextResponse.json(
      { error: e?.message || 'internal error' },
      { status: 500 },
    );
  }
}
