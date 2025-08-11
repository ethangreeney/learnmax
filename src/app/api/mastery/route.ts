import { NextRequest, NextResponse } from 'next/server';
import prisma, { INTERACTIVE_TX_OPTIONS } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { revalidateTag } from 'next/cache';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;

    const parsed = (await req.json().catch(() => ({}))) as {
      subtopicId?: string;
      eloDelta?: number;
      firstPerfect?: boolean;
    };
    const subtopicId = String(parsed?.subtopicId || '').trim();
    const clientDelta =
      typeof parsed?.eloDelta === 'number' && Number.isFinite(parsed.eloDelta)
        ? Math.trunc(parsed.eloDelta as number)
        : undefined;
    const firstPerfect = Boolean(parsed?.firstPerfect);

    const ELO_MASTERY_FIRST = parseInt(
      process.env.ELO_MASTERY_FIRST || '20',
      10
    );
    const ELO_MASTERY_LATER = parseInt(
      process.env.ELO_MASTERY_LATER || '0',
      10
    );
    const eloDelta =
      clientDelta !== undefined
        ? clientDelta
        : firstPerfect
          ? ELO_MASTERY_FIRST
          : ELO_MASTERY_LATER;

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
        if (eloDelta && Number.isFinite(eloDelta) && eloDelta !== 0) {
          await tx.user.update({
            where: { id: userId },
            data: { elo: { increment: eloDelta } },
          });
        }
        return { created: true };
      } catch (e: any) {
        // Unique constraint violation => already mastered; do not increment Elo
        if (e && typeof e === 'object' && (e as any).code === 'P2002') {
          return { created: false };
        }
        throw e;
      }
    }, INTERACTIVE_TX_OPTIONS);

    // Keep streak behavior unchanged
    await bumpDailyStreak(userId);
    // Ensure dashboard/profile caches reflect new mastery counts
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}

    return NextResponse.json({ ok: true, eloIncremented: created, eloDelta: created ? eloDelta : 0 });
  } catch (e: any) {
    console.error('MASTERY_API_ERROR:', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
