import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bumpDailyStreak } from '@/lib/streak';
import { requireSession } from '@/lib/auth';
import { revalidateTag } from 'next/cache';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = (session.user as any)?.id as string;
    const limit = rateLimit(
      rateLimitKey(req, 'quiz-attempt', userId),
      120,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many quiz attempts. Please wait and try again.' },
        { status: 429 }
      );
    }

    const { questionId, selectedIndex } = (await req.json()) as {
      questionId: string;
      selectedIndex: number;
    };
    if (
      !questionId ||
      typeof selectedIndex !== 'number' ||
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex > 3
    ) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const question = await prisma.quizQuestion.findFirst({
      where: { id: questionId, subtopic: { lecture: { userId } } },
      select: { answerIndex: true },
    });
    if (!question) {
      return NextResponse.json(
        { error: 'Question not found.' },
        { status: 404 }
      );
    }
    const isCorrect = selectedIndex === question.answerIndex;

    await prisma.quizAttempt.create({
      data: { userId, questionId, selectedIndex, isCorrect },
    });
    // Bump streak on any attempt
    await bumpDailyStreak(userId);
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
