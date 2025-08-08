import { NextResponse } from 'next/server';
import { generateJSON } from '../../../lib/ai';

export async function POST(req: Request) {
  try {
    const { lessonMd, difficulty = 'hard' } = await req.json();

    if (!lessonMd || typeof lessonMd !== 'string' || lessonMd.trim().length < 50) {
      return NextResponse.json({ error: 'lessonMd (≥50 chars) is required' }, { status: 400 });
    }

    const prompt =
`You are a strict exam writer. Create ${difficulty === 'hard' ? '4–6' : '3–4'} challenging multiple-choice questions
using ONLY the lesson content below. Avoid trivia that is not stated or implied.
Questions should test application, comparison, or subtle distinctions — not definitions only.

Return STRICT JSON:
{
  "questions": [
    { "question": "…", "options": ["…","…","…","…"], "answerIndex": 0, "explain": "…" }
  ]
}

LESSON MARKDOWN:
---
${lessonMd}
---`;

    const json = await generateJSON(prompt);
    const questions = Array.isArray(json?.questions) ? json.questions : [];
    return NextResponse.json({ questions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'quiz failed' }, { status: 500 });
  }
}
