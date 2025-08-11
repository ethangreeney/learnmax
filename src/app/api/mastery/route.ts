import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;

    const { subtopicId, eloDelta = 5 } = (await req.json()) as {
      subtopicId: string;
      eloDelta?: number;
    };

    if (!subtopicId) {
      return NextResponse.json(
        { error: 'subtopicId is required.' },
        { status: 400 }
      );
    }

    // Increment Elo ONLY if a new mastery record is created.
    const { created } = await prisma.$transaction(async (tx) => {
      try {
        await tx.userMastery.create({ data: { userId, subtopicId } });
        await tx.user.update({
          where: { id: userId },
          data: { elo: { increment: eloDelta } },
        });
        return { created: true };
      } catch (e: any) {
        // Unique constraint violation => already mastered; do not increment Elo
        if (e && typeof e === 'object' && (e as any).code === 'P2002') {
          return { created: false };
        }
        throw e;
      }
    });

    // Keep streak behavior unchanged
    await bumpDailyStreak(userId);

    return NextResponse.json({ ok: true, eloIncremented: created });
  } catch (e: any) {
    console.error('MASTERY_API_ERROR:', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
