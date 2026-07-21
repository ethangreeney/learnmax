import { NextRequest, NextResponse } from 'next/server';
import prisma, { INTERACTIVE_TX_OPTIONS } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { revalidateTag } from 'next/cache';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';
import crypto from 'crypto';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;
    const limit = rateLimit(
      rateLimitKey(req, 'mastery', userId),
      60,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many mastery updates. Please wait and try again.' },
        { status: 429 }
      );
    }

    const parsed = (await req.json().catch(() => ({}))) as {
      subtopicId?: string;
    };
    const subtopicId = String(parsed?.subtopicId || '')
      .trim()
      .slice(0, 80);

    const ELO_MASTERY_FIRST = parseInt(
      process.env.ELO_MASTERY_FIRST || '20',
      10
    );
    const eloDelta = Number.isFinite(ELO_MASTERY_FIRST)
      ? Math.max(0, Math.min(100, ELO_MASTERY_FIRST))
      : 20;

    if (!subtopicId) {
      return NextResponse.json(
        { error: 'subtopicId is required.' },
        { status: 400 }
      );
    }

    const subtopic = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lecture: { userId } },
      select: { lectureId: true },
    });
    if (!subtopic) {
      return NextResponse.json(
        { error: 'Subtopic not found.' },
        { status: 404 }
      );
    }

    const savedPrompt = await prisma.shortAnswerPrompt.findUnique({
      where: {
        lectureId_subtopicId: {
          lectureId: subtopic.lectureId,
          subtopicId,
        },
      },
      select: { prompt: true },
    });
    if (!savedPrompt?.prompt) {
      return NextResponse.json(
        { error: 'Complete the mastery check before continuing.' },
        { status: 409 }
      );
    }

    const promptHash = crypto
      .createHash('sha256')
      .update([subtopic.lectureId, savedPrompt.prompt].join('|'))
      .digest('hex');
    const grade = await prisma.shortAnswerGrade.findUnique({
      where: { userId_promptHash: { userId, promptHash } },
      select: { score: true },
    });
    if (!grade || grade.score < 8) {
      return NextResponse.json(
        { error: 'Score 8/10 or higher to unlock this section.' },
        { status: 409 }
      );
    }

    // Increment Elo only when this request creates the mastery record. Using
    // skipDuplicates keeps retries safe without aborting the PostgreSQL
    // transaction on the unique (userId, subtopicId) constraint.
    const { created } = await prisma.$transaction(async (tx) => {
      const inserted = await tx.userMastery.createMany({
        data: [{ userId, subtopicId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { created: false };

      if (eloDelta && Number.isFinite(eloDelta) && eloDelta !== 0) {
        await tx.user.update({
          where: { id: userId },
          data: { elo: { increment: eloDelta } },
        });
      }
      return { created: true };
    }, INTERACTIVE_TX_OPTIONS);

    // Keep streak behavior unchanged
    await bumpDailyStreak(userId);
    // Ensure dashboard/profile caches reflect new mastery counts
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}

    return NextResponse.json({
      ok: true,
      eloIncremented: created,
      eloDelta: created ? eloDelta : 0,
    });
  } catch (e: any) {
    console.error('MASTERY_API_ERROR:', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
