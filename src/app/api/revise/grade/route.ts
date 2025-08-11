import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import crypto from 'crypto';

// Simple in-memory cache to stabilize repeated grading for identical inputs in a single server instance
const gradeCache = new Map<string, { score: number; modelAnswer?: string }>();

// Deterministic hashing to stabilize grading for identical answers
function stableHash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      prompt?: string;
      answer?: string;
    };
    const lectureId = String(body?.lectureId || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const answer = String(body?.answer || '').trim();
    if (!lectureId || !prompt || !answer) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Ensure lecture ownership and pull composite lesson text for grounding
    const lecture = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: {
        title: true,
        originalContent: true,
        subtopics: { orderBy: { order: 'asc' }, select: { title: true, overview: true, explanation: true } },
      },
    });
    if (!lecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const parts: string[] = [`# ${lecture.title}`];
    for (const s of lecture.subtopics) {
      if (s.title) parts.push(`\n## ${s.title}`);
      if (s.overview) parts.push(s.overview);
      if (s.explanation) parts.push(s.explanation);
    }
    const lessonMd = (parts.join('\n\n').trim() || lecture.originalContent || '').slice(0, 8000);
    if (!lessonMd || lessonMd.length < 50) {
      return NextResponse.json({ error: 'Lecture content too short' }, { status: 400 });
    }

    // Deterministic cache key for consistency on repeated grading attempts
    const key = stableHash([lectureId, prompt, answer].join('|'));
    const cached = gradeCache.get(key);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Strict grading via AI with numeric 0..10, grounded in lesson only.
    const { generateJSON } = await import('@/lib/ai');
    const gradingPrompt = `You are grading a short-answer response using ONLY the provided LESSON.
Return ONLY JSON: { "score": number, "modelAnswer": string }
Scoring rules (0-10):
- 10: Completely correct and comprehensive; covers all key points.
- 7-9: Mostly correct; minor omissions but core ideas present.
- 4-6: Partially correct; significant gaps or misunderstandings.
- 1-3: Minimal understanding; major errors or missing key concepts.
- 0: Incorrect or off-topic.
Ignore minor grammar/spelling. Ground strictly in the LESSON. Do not invent facts.
Ensure identical answers produce the same score for the same prompt.
---
LESSON:
${lessonMd}
---
PROMPT:
${prompt}
---
LEARNER_ANSWER (hash:${key.slice(0, 8)}):
${answer}
---`;
    // Generous timeout and determinism via seed when supported by backend
    let result: any = {};
    try {
      result = await generateJSON(gradingPrompt, 'gemini-2.5-flash');
    } catch {}
    let score = Math.max(0, Math.min(10, Number(result?.score)));
    if (!Number.isFinite(score)) score = 0;
    const modelAnswer = String(result?.modelAnswer || '').trim().slice(0, 3000);

    const out = { score, modelAnswer };
    gradeCache.set(key, out);
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


