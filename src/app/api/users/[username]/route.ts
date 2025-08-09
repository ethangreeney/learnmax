import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(_req: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const { username } = await context.params;
    const uname = decodeURIComponent(username || '').toLowerCase();
    if (!uname) return NextResponse.json({ error: 'username required' }, { status: 400 });

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
        masteredSubtopics: { select: { id: true } },
        _count: { select: { masteredSubtopics: true } },
      },
    });
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    const rank = await prisma.rank.findFirst({ where: { minElo: { lte: user.elo } }, orderBy: { minElo: 'desc' } });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        image: user.image,
        elo: user.elo,
        streak: user.streak,
        masteredCount: user._count.masteredSubtopics,
        quiz: { totalAttempts: total, correct, accuracy },
        rank: rank ? { slug: rank.slug, name: rank.name, minElo: rank.minElo, iconUrl: rank.iconUrl } : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}


