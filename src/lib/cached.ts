import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma';
import { getRanksSafe, pickRankForElo, type RankDef } from '@/lib/ranks';

export async function getUserStatsCached(userId: string) {
  const fn = unstable_cache(
    async () => {
      const [userLite, masteredCount, currentLectureCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            elo: true,
            streak: true,
          },
        }),
        prisma.userMastery.count({ where: { userId } }),
        prisma.lecture.count({ where: { userId } }),
      ]);
      let lifetimeLecturesCreated = currentLectureCount;
      let lifetimeSubtopicsMastered = masteredCount;
      try {
        const rows = (await prisma.$queryRaw`SELECT "lifetimeLecturesCreated" AS lec, "lifetimeSubtopicsMastered" AS sub FROM "User" WHERE "id" = ${userId} LIMIT 1`) as Array<{ lec: number | null; sub: number | null }>;
        if (Array.isArray(rows) && rows[0]) {
          const r = rows[0];
          if (typeof r.lec === 'number') lifetimeLecturesCreated = r.lec;
          if (typeof r.sub === 'number') lifetimeSubtopicsMastered = r.sub;
          // Persist max so lifetime never decreases even if current does
          try {
            await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = GREATEST(COALESCE("lifetimeLecturesCreated", 0), ${currentLectureCount}), "lifetimeSubtopicsMastered" = GREATEST(COALESCE("lifetimeSubtopicsMastered", 0), ${masteredCount}) WHERE "id" = ${userId}`;
          } catch { }
          lifetimeLecturesCreated = Math.max(lifetimeLecturesCreated, currentLectureCount);
          lifetimeSubtopicsMastered = Math.max(lifetimeSubtopicsMastered, masteredCount);
        }
      } catch { }
      return {
        user: userLite,
        masteredCount,
        lectureCount: currentLectureCount,
        lifetime: {
          lecturesCreated: lifetimeLecturesCreated,
          subtopicsMastered: lifetimeSubtopicsMastered,
        },
      };
    },
    ['user-stats', userId],
    { revalidate: 30, tags: [`user-stats:${userId}`] }
  );
  return fn();
}

export async function getLecturesCached(userId: string, options?: { take?: number }) {
  const fn = unstable_cache(
    async () => {
      const lectures = await prisma.lecture.findMany({
        where: { userId },
        orderBy: [{ starred: 'desc' }, { createdAt: 'desc' }],
        take: Math.max(1, Math.min(200, options?.take ?? 50)),
        include: { _count: { select: { subtopics: true } } },
      });
      return lectures;
    },
    ['user-lectures', userId, String(options?.take ?? 50)],
    { revalidate: 30, tags: [`user-lectures:${userId}`] }
  );
  return fn();
}

export async function getProfileForUser(
  userId: string,
  opts?: {
    email?: string | null;
    providerImage?: string | null;
    // Optional prefetches to avoid duplicate DB work when the caller already has these
    stats?: Awaited<ReturnType<typeof getUserStatsCached>>;
    ranks?: RankDef[];
    includeQuiz?: boolean;
  }
) {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      bio: true,
      image: true,
      elo: true,
      streak: true,
      email: true,
    },
  });
  if (!user) {
    const email = opts?.email || undefined;
    if (email) {
      const byEmail = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          username: true,
          bio: true,
          image: true,
          elo: true,
          streak: true,
          email: true,
        },
      });
      if (byEmail) {
        user = byEmail;
      } else {
        try {
          user = await prisma.user.create({
            data: {
              id: userId,
              email,
              name: null,
              image: opts?.providerImage || null,
              elo: 0,
              streak: 0,
            },
            select: {
              id: true,
              name: true,
              username: true,
              bio: true,
              image: true,
              elo: true,
              streak: true,
              email: true,
            },
          });
        } catch {
          const retry = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              username: true,
              bio: true,
              image: true,
              elo: true,
              streak: true,
              email: true,
            },
          });
          if (!retry) throw new Error('Not found');
          user = retry;
        }
      }
    } else {
      throw new Error('Not found');
    }
  }

  // Align profile stats with the dashboard by sourcing the same counters
  const [stats, quizAgg] = await Promise.all([
    opts?.stats ? Promise.resolve(opts.stats) : getUserStatsCached(userId),
    opts?.includeQuiz === false
      ? Promise.resolve([] as any)
      : prisma.quizAttempt.groupBy({ by: ['isCorrect'], where: { userId }, _count: { _all: true } }),
  ]);
  const ranks = opts?.ranks ?? (await getRanksSafe());
  const r = pickRankForElo(ranks, user.elo);
  const rank = r ? { slug: r.slug, name: r.name, minElo: r.minElo, iconUrl: r.iconUrl } : null;
  const total = Array.isArray(quizAgg)
    ? quizAgg.reduce(
      (acc: number, row: { _count: { _all: number } }) => acc + row._count._all,
      0
    )
    : 0;
  const correct = Array.isArray(quizAgg)
    ? quizAgg.find((rr: any) => rr.isCorrect)?._count._all || 0
    : 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const image = user.image || opts?.providerImage || null;
  const isAdmin =
    !!opts?.email && (await import('@/lib/admin')).isAdminEmail(opts.email);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio,
    image,
    elo: user.elo,
    streak: user.streak,
    masteredCount: stats.masteredCount,
    // Surface lifetime counters from the same source used on the dashboard
    lifetimeLecturesCreated: stats.lifetime?.lecturesCreated,
    lifetimeSubtopicsMastered: stats.lifetime?.subtopicsMastered,
    quiz: { totalAttempts: total, correct, accuracy },
    rank: rank
      ? {
        slug: (rank as any).slug,
        name: (rank as any).name,
        minElo: (rank as any).minElo,
        iconUrl: (rank as any).iconUrl,
      }
      : null,
    isAdmin,
  };
}

export type LeaderboardPeriod = 'all' | '30d';
export type LeaderboardScope = 'global' | 'following';
export type LeaderboardItem = {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  elo: number;
  rank: { slug: string; name: string; minElo: number; iconUrl: string | null } | null;
  masteries30d?: number;
  lastActiveISO: string | null;
};

export async function getLeaderboardCached(period: LeaderboardPeriod, scope: LeaderboardScope = 'global', viewerId?: string | null) {
  const fn = unstable_cache(
    async () => {
      const ranks = await getRanksSafe();
      const toRank = (elo: number) => {
        const rr = pickRankForElo(ranks, elo);
        return rr ? { slug: rr.slug, name: rr.name, minElo: rr.minElo, iconUrl: rr.iconUrl } : null;
      };

      let followingIds: string[] | null = null;
      if (scope === 'following' && viewerId) {
        try {
          const rows = await (prisma as any).follow.findMany({
            where: { followerId: viewerId },
            select: { followingId: true },
          });
          followingIds = [viewerId, ...rows.map((r: any) => r.followingId)];
        } catch {
          followingIds = [viewerId];
        }
      }

      if (period === '30d') {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const baseWhere: any = { createdAt: { gte: since } };
        if (followingIds && followingIds.length > 0) baseWhere.userId = { in: followingIds };
        const grouped = await prisma.userMastery.groupBy({
          by: ['userId'],
          where: baseWhere,
          _count: { userId: true },
          orderBy: { _count: { userId: 'desc' } },
          take: 50,
        });
        const userIds = grouped.map((g) => g.userId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, username: true, image: true, elo: true, lastStudiedAt: true },
        });
        const idToUser = new Map(users.map((u) => [u.id, u]));
        const items: LeaderboardItem[] = grouped
          .map((g) => {
            const u = idToUser.get(g.userId);
            if (!u) return null;
            return {
              id: u.id,
              name: u.name,
              username: (u as any).username ?? null,
              image: u.image,
              elo: u.elo,
              rank: toRank(u.elo),
              masteries30d: (g as any)._count?.userId ?? 0,
              lastActiveISO: (u as any).lastStudiedAt ? (u as any).lastStudiedAt.toISOString() : null,
            } as LeaderboardItem;
          })
          .filter(Boolean) as LeaderboardItem[];
        return items;
      }

      // Default: all-time ordered by Elo
      const users = await prisma.user.findMany({
        where: followingIds && followingIds.length > 0 ? { id: { in: followingIds } } : undefined,
        select: { id: true, name: true, username: true, image: true, elo: true, lastStudiedAt: true },
        orderBy: { elo: 'desc' },
        take: 50,
      });
      const items: LeaderboardItem[] = users.map((u) => ({
        id: u.id,
        name: u.name,
        username: (u as any).username ?? null,
        image: u.image,
        elo: u.elo,
        rank: toRank(u.elo),
        lastActiveISO: (u as any).lastStudiedAt ? (u as any).lastStudiedAt.toISOString() : null,
      }));
      return items;
    },
    ['leaderboard', period, scope, viewerId || 'anon'],
    { revalidate: 60, tags: [`leaderboard:${period}:${scope}:${viewerId || 'anon'}`, 'ranks'] }
  );
  return fn();
}
