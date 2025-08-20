import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      lessonMd?: string;
      subtopicTitle?: string;
    };
    const lessonMd = String(body?.lessonMd || '').trim();
    const subtopicTitle = String(body?.subtopicTitle || '').trim();
    if (!lessonMd || lessonMd.length < 50) {
      return NextResponse.json({ error: 'Lesson content too short' }, { status: 400 });
    }

    const { generateJSON } = await import('@/lib/ai');
    const prompt = [
      'You are writing ONE short-answer question to assess conceptual understanding using ONLY the LESSON below.',
      'Requirements:',
      '- The question must be self-contained and answerable strictly from the LESSON.',
      '- Make it broad and high-level to check understanding of the subtopic overall, not a niche detail.',
      '- Avoid asking for rote memorization of minor facts, numbers, or edge cases.',
      '- Do not require any outside knowledge not present in the LESSON.',
      'Return ONLY JSON with exactly this shape:',
      '{ "prompt": string, "modelAnswer": string }',
      'Model answer should be concise (2–6 sentences) and aligned with the LESSON.',
      '---',
      subtopicTitle ? `SUBTOPIC: ${subtopicTitle}` : '',
      'LESSON:',
      lessonMd.slice(0, 6000),
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    let out: any = {};
    try {
      const model = process.env.AI_QUALITY_MODEL || 'gpt-5-mini';
      out = await generateJSON(prompt, model, undefined);
    } catch {}

    const qPrompt = String(out?.prompt || '').trim();
    const modelAnswer = String(out?.modelAnswer || '').trim();
    if (!qPrompt) {
      return NextResponse.json({ prompt: '', modelAnswer: '' });
    }
    return NextResponse.json({ prompt: qPrompt, modelAnswer });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


