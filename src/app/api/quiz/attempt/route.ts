import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { bumpDailyStreak } from '@/lib/streak';
import { requireSession } from '@/lib/auth';
import { revalidateTag } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = (session.user as any)?.id as string;
    const { questionId, selectedIndex, isCorrect } = (await req.json()) as {
      questionId: string;
      selectedIndex: number;
      isCorrect: boolean;
    };
    if (
      !questionId ||
      typeof selectedIndex !== 'number' ||
      typeof isCorrect !== 'boolean'
    ) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

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
