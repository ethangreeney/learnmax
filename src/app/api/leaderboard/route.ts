import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

function parseTimeframe(tf: string | null | undefined): 'all' | '30d' {
  if (!tf) return 'all';
  const v = String(tf).toLowerCase();
  return v === '30d' || v === '30' ? '30d' : 'all';
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const meId = (session.user as any)?.id as string;
    const { searchParams } = new URL(req.url);
    const scope = (searchParams.get('scope') || 'global').toLowerCase() as 'global' | 'friends';
    const timeframe = parseTimeframe(searchParams.get('timeframe'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)));

    const since = timeframe === '30d' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : null;

    // Determine candidate user IDs if friends scope
    let candidateUserIds: string[] | null = null;
    if (scope === 'friends') {
      const friends = await prisma.follow.findMany({
        where: { followerId: meId },
        select: { followingId: true },
      });
      candidateUserIds = [meId, ...new Set(friends.map((f) => f.followingId))];
      if (candidateUserIds.length === 0) {
        return NextResponse.json({ users: [], nextCursor: null });
      }
    }

    // Base where clause: exclude users who opted out
    const baseWhere: any = { leaderboardOptOut: false };
    if (candidateUserIds) baseWhere.id = { in: candidateUserIds };

    // Rank sort primary: elo desc
    // Tiebreaker: recent activity (lastStudiedAt desc, then id to stabilize)
    // If timeframe = 30d, we consider only users with activity in 30d for tiebreaker and can compute a recency score
    // Simpler: filter attempts in 30d to compute last activity; fallback to lastStudiedAt

    // Compute lastActivityAt per user when timeframe=30d
    let users: { id: string; name: string | null; username: string | null; image: string | null; elo: number; lastStudiedAt: Date | null }[] = [];
    if (timeframe === '30d') {
      // Get candidates first (by elo to bound result set) then compute activity
      const topCandidates = await prisma.user.findMany({
        where: baseWhere,
        select: { id: true, name: true, username: true, image: true, elo: true, lastStudiedAt: true },
        orderBy: [{ elo: 'desc' }, { lastStudiedAt: 'desc' }, { id: 'asc' }],
        take: 500,
      });
      if (topCandidates.length === 0) return NextResponse.json({ users: [] });
      const ids = topCandidates.map((u) => u.id);
      const attempts = await prisma.quizAttempt.findMany({
        where: { userId: { in: ids }, createdAt: { gte: since! } },
        select: { userId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const lastByUser = new Map<string, Date>();
      for (const a of attempts) {
        if (!lastByUser.has(a.userId)) lastByUser.set(a.userId, a.createdAt);
      }
      users = topCandidates
        .map((u) => ({ ...u, lastStudiedAt: lastByUser.get(u.id) || u.lastStudiedAt }))
        .filter((u) => (u.lastStudiedAt ? u.lastStudiedAt >= since! : false));
    } else {
      users = await prisma.user.findMany({
        where: baseWhere,
        select: { id: true, name: true, username: true, image: true, elo: true, lastStudiedAt: true },
        orderBy: [{ elo: 'desc' }, { lastStudiedAt: 'desc' }, { id: 'asc' }],
        take: 500,
      });
    }

    users.sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      const at = b.lastStudiedAt?.getTime() || 0;
      const bt = a.lastStudiedAt?.getTime() || 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    });

    const sliced = users.slice(0, limit).map((u, index) => ({
      rank: index + 1,
      id: u.id,
      name: u.name,
      username: u.username,
      image: u.image,
      elo: u.elo,
      lastActiveAt: u.lastStudiedAt ? u.lastStudiedAt.toISOString() : null,
    }));

    return NextResponse.json({ users: sliced });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}


