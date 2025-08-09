import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

type IncomingQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      subtopicId?: string;
      questions?: IncomingQuestion[];
    };
    const subtopicId = String(body?.subtopicId || '').trim();
    const questions = Array.isArray(body?.questions) ? body.questions : [];
    if (!subtopicId) {
      return NextResponse.json({ error: 'subtopicId is required' }, { status: 400 });
    }

    // Ensure ownership: subtopic belongs to a lecture owned by the current user
    const subtopic = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lecture: { userId } },
      select: { id: true },
    });
    if (!subtopic) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch existing questions for this subtopic
    const existing = await prisma.quizQuestion.findMany({
      where: { subtopicId },
      select: { id: true, prompt: true, options: true, answerIndex: true, explanation: true },
    });

    // Cap at two questions per subtopic for now (to match UI expectation)
    const REQUIRED = 2;
    if (existing.length >= REQUIRED) {
      return NextResponse.json({
        questions: existing.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options as unknown as string[],
          answerIndex: q.answerIndex,
          explanation: q.explanation,
        })),
      });
    }

    // Validate incoming payload; only take what we need to fill up to REQUIRED
    const toInsert: IncomingQuestion[] = [];
    for (const q of questions) {
      const ok =
        q &&
        typeof q.prompt === 'string' && q.prompt.trim() &&
        Array.isArray(q.options) && q.options.length === 4 &&
        typeof q.answerIndex === 'number' && q.answerIndex >= 0 && q.answerIndex < 4 &&
        typeof q.explanation === 'string';
      if (ok) toInsert.push({
        prompt: q.prompt.trim(),
        options: q.options.map((o) => String(o)),
        answerIndex: q.answerIndex,
        explanation: q.explanation,
      });
      if (existing.length + toInsert.length >= REQUIRED) break;
    }

    // Create individually so we can return IDs
    for (const q of toInsert) {
      await prisma.quizQuestion.create({
        data: {
          prompt: q.prompt,
          options: q.options as unknown as any,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
          subtopicId,
        },
      });
    }

    const final = await prisma.quizQuestion.findMany({
      where: { subtopicId },
      select: { id: true, prompt: true, options: true, answerIndex: true, explanation: true },
    });
    return NextResponse.json({
      questions: final.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options as unknown as string[],
        answerIndex: q.answerIndex,
        explanation: q.explanation,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


