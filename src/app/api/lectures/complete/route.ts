import { NextRequest, NextResponse } from 'next/server';
import prisma, { INTERACTIVE_TX_OPTIONS } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { revalidateTag } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { lectureId } = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
    };
    const id = String(lectureId || '').trim();
    if (!id) {
      return NextResponse.json(
        { error: 'lectureId is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const lecture = await prisma.lecture.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!lecture)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ELO_PER_SUBTOPIC = parseInt(process.env.ELO_PER_SUBTOPIC || '10', 10);

    const result = await prisma.$transaction(async (tx) => {
      const subtopicCount = await tx.subtopic.count({
        where: { lectureId: id },
      });
      const masteryCount = await tx.userMastery.count({
        where: { userId, subtopic: { lectureId: id } },
      });
      if (subtopicCount === 0 || masteryCount !== subtopicCount) {
        return {
          status: 'incomplete' as const,
          subtopicCount,
          masteryCount,
        };
      }

      const insertedCompletion = await tx.userLectureCompletion.createMany({
        data: [{ userId, lectureId: id }],
        skipDuplicates: true,
      });
      if (insertedCompletion.count === 0) {
        return { status: 'complete' as const, created: false };
      }

      const eloAward =
        (Number.isFinite(ELO_PER_SUBTOPIC) ? ELO_PER_SUBTOPIC : 10) *
        subtopicCount;

      // Keep the event idempotent too, including for legacy data where the
      // completion row and Elo event may not have been written together.
      const insertedEvent = await tx.eloEvent.createMany({
        data: [{ userId, kind: 'lecture-complete', ref: id, delta: eloAward }],
        skipDuplicates: true,
      });
      if (insertedEvent.count === 0) {
        return { status: 'complete' as const, created: false };
      }

      if (eloAward && Number.isFinite(eloAward) && eloAward !== 0) {
        await tx.user.update({
          where: { id: userId },
          data: { elo: { increment: eloAward } },
        });
      }
      return { status: 'complete' as const, created: true };
    }, INTERACTIVE_TX_OPTIONS);

    if (result.status === 'incomplete') {
      return NextResponse.json(
        {
          error:
            result.subtopicCount === 0
              ? 'This lesson has no sections to complete yet.'
              : 'Master every lesson section before completing this lesson.',
          mastered: result.masteryCount,
          total: result.subtopicCount,
        },
        { status: 409 }
      );
    }

    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true, eloIncremented: result.created });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
