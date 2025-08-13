import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRanksSafe, pickRankForElo } from '@/lib/ranks';
import { getUserStatsCached } from '@/lib/cached';

export async function GET(
  _req: Request,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    const uname = decodeURIComponent(username || '').toLowerCase();
    if (!uname)
      return NextResponse.json({ error: 'username required' }, { status: 400 });

    const user = await prisma.user.findFirst({
      where: { username: uname },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        image: true,
        elo: true,
        streak: true,
        leaderboardOptOut: true,
        masteredSubtopics: { select: { id: true } },
        _count: { select: { masteredSubtopics: true } },
      },
    });
    if (!user)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Compute accuracy
    const agg = await prisma.quizAttempt.groupBy({
      by: ['isCorrect'],
      where: { userId: user.id },
      _count: { _all: true },
    });
    const total = agg.reduce((a, r) => a + r._count._all, 0);
    const correct = agg.find((r) => r.isCorrect)?._count._all || 0;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;

    // Determine rank based on ELO
    const ranks = await getRanksSafe();
    const rank = pickRankForElo(ranks, user.elo);

    // Align counts with dashboard lifetime counters
    const stats = await getUserStatsCached(user.id);
    const lifetimeSubtopicsMastered =
      (stats as any)?.lifetime?.subtopicsMastered ?? (stats as any)?.masteredCount ?? user._count.masteredSubtopics;
    const lifetimeLecturesCreated = (stats as any)?.lifetime?.lecturesCreated ?? (stats as any)?.lectureCount ?? 0;

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        image: user.image,
        elo: user.elo,
        streak: user.streak,
        leaderboardOptOut: user.leaderboardOptOut,
        masteredCount: lifetimeSubtopicsMastered,
        lifetimeLecturesCreated,
        lifetimeSubtopicsMastered,
        highestElo: user.elo,
        quiz: { totalAttempts: total, correct, accuracy },
        rank: rank
          ? {
              slug: rank.slug,
              name: rank.name,
              minElo: rank.minElo,
              iconUrl: rank.iconUrl,
            }
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
