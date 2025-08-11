import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

type MCQ = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

type ShortQ = {
  prompt: string;
  modelAnswer?: string;
  rubric?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = (await req.json().catch(() => ({}))) as { lectureId?: string; size?: number };
    const lectureId = String(body?.lectureId || '').trim();
    const size = Math.min(8, Math.max(4, Number(body?.size) || 6));
    if (!lectureId) {
      return NextResponse.json({ error: 'lectureId required' }, { status: 400 });
    }
    const lecture = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: {
        id: true,
        title: true,
        originalContent: true,
        subtopics: {
          orderBy: { order: 'asc' },
          select: { id: true, title: true, overview: true, explanation: true },
        },
      },
    });
    if (!lecture) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Build a composite lesson markdown to ground generation (subtopics with explanations preferred)
    const blocks: string[] = [];
    blocks.push(`# ${lecture.title}`);
    for (const s of lecture.subtopics) {
      const title = (s.title || '').trim();
      const overview = (s.overview || '').trim();
      const explanation = (s.explanation || '').trim();
      if (title) blocks.push(`\n## ${title}`);
      if (overview) blocks.push(overview);
      if (explanation) blocks.push(explanation);
    }
    const composite = blocks.join('\n\n').trim() || lecture.originalContent;
    const lessonMd = composite.length >= 50 ? composite : lecture.originalContent;
    if (!lessonMd || lessonMd.trim().length < 50) {
      return NextResponse.json({ error: 'Lecture content is too short for revise' }, { status: 400 });
    }

    // Strategy: request 3 MCQs and 3 Short Answer prompts, then shuffle
    // Reuse existing MCQ generator route to ensure consistent format and auditing
    let mcqs: MCQ[] = [];
    try {
      const base = req.nextUrl?.origin || '';
      const res = await fetch(`${base}/api/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonMd, lectureId: lecture.id, count: Math.ceil(size / 2) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { questions: MCQ[] };
        mcqs = Array.isArray(data.questions) ? data.questions.slice(0, Math.ceil(size / 2)) : [];
      }
    } catch {}

    // If we somehow got 0 MCQs, try once more to fetch at least 1
    if (mcqs.length === 0) {
      try {
        const base = req.nextUrl?.origin || '';
        const res = await fetch(`${base}/api/quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonMd, lectureId: lecture.id, count: 1 }),
        });
        if (res.ok) {
          const data = (await res.json()) as { questions: MCQ[] };
          mcqs = Array.isArray(data.questions) ? data.questions.slice(0, 1) : [];
        }
      } catch {}
    }

    // Generate short-answer prompts + model answers via AI
    const shortCount = size - mcqs.length;
    const shortQs: ShortQ[] = [];
    if (shortCount > 0) {
      // Use ai.ts generateJSON with a strict rubric
      const { generateJSON } = await import('@/lib/ai');
      const prompt = `Using ONLY the LESSON below, create ${shortCount} short-answer questions with model answers.
Return only JSON:
{ "questions": [ { "prompt": "string", "modelAnswer": "string" } ] }
Rules:
- Questions must target key concepts, definitions, mechanisms, or reasoning steps from the lesson.
- Model answers must be concise (2–6 sentences) and complete.
- Do not include any content not grounded in the lesson.
---
LESSON:
${lessonMd.slice(0, 6000)}
---`;
      try {
        const json: any = await generateJSON(prompt, 'gemini-2.5-flash');
        const arr = Array.isArray(json?.questions) ? json.questions : [];
        for (const q of arr) {
          const p = String(q?.prompt || '').trim();
          const a = String(q?.modelAnswer || '').trim();
          if (p && a) shortQs.push({ prompt: p, modelAnswer: a });
          if (shortQs.length >= shortCount) break;
        }
      } catch {}
    }

    // Compose and shuffle
    type Mixed = { kind: 'mcq' | 'short'; data: any };
    const mixed: Mixed[] = [];
    for (const q of mcqs) mixed.push({ kind: 'mcq', data: q });
    for (const q of shortQs) mixed.push({ kind: 'short', data: q });
    // Fisher-Yates
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }

    return NextResponse.json({ questions: mixed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


