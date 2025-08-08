import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateJSON } from '@/lib/ai';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = (await req.json()) as { subtopicIds?: string[] };
    const subtopicIds = Array.isArray(body?.subtopicIds) ? body.subtopicIds : [];

    if (subtopicIds.length === 0) {
      return NextResponse.json({ error: 'subtopicIds is required (string[])' }, { status: 400 });
    }

    const subs = await prisma.subtopic.findMany({
      where: { id: { in: subtopicIds } },
      select: { id: true, title: true, overview: true, explanation: true },
      orderBy: { id: 'asc' },
    });

    if (subs.length === 0) {
      return NextResponse.json({ error: 'Subtopics not found.' }, { status: 404 });
    }

    // Only generate questions AFTER lesson content (explanation) exists.
    if (subs.some(s => !s.explanation || !s.explanation.trim())) {
      return NextResponse.json(
        { error: 'Lesson not ready for one or more subtopics.' },
        { status: 409 }
      );
    }

    const lessons = subs.map(s => ({
      title: s.title,
      lesson: `${s.overview || ''}

${s.explanation || ''}`.trim(),
    }));

    const prompt = `
You are an expert assessment writer. Create **hard mastery** questions *strictly* from the LESSON text for each subtopic.

Rules:
- Bloom level: application/analysis/evaluation (no recall-only).
- Scenario-based or multi-step reasoning, require inference from the LESSON.
- Distractors must be plausible and grounded in the LESSON (no external trivia).
- Do NOT add option letters like "A.", "B.", etc. — just the option strings.
- Exactly ONE question per input subtopic.
- Output ONLY this JSON:

{
  "questions": [
    {
      "prompt": "string",
      "options": ["string","string","string","string"],
      "answerIndex": 0,
      "explanation": "short rationale grounded in the LESSON",
      "subtopicTitle": "the subtopic title"
    }
  ]
}

LESSONS:
${JSON.stringify(lessons, null, 2)}
`;

    const ai = await generateJSON(prompt);
    if (!ai || !Array.isArray(ai.questions)) {
      return NextResponse.json({ error: 'Bad AI output' }, { status: 502 });
    }

    const out = {
      questions: ai.questions
        .filter((q: any) =>
          q &&
          typeof q.prompt === 'string' &&
          Array.isArray(q.options) && q.options.length === 4 &&
          Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4 &&
          typeof q.explanation === 'string'
        )
        .map((q: any) => ({
          prompt: String(q.prompt),
          options: q.options.map((o: any) => String(o)),
          answerIndex: q.answerIndex,
          explanation: String(q.explanation),
          subtopicTitle: String(q.subtopicTitle || subs[0]?.title || 'Subtopic'),
        })),
    };

    if (out.questions.length === 0) {
      return NextResponse.json({ error: 'No questions generated' }, { status: 502 });
    }

    return NextResponse.json(out);
  } catch (err: any) {
    console.error('HARD_QUIZ_API_ERROR:', err?.stack || err?.message || err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: err?.status || 500 });
  }
}
