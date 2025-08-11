import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma';

export async function getUserStatsCached(userId: string) {
  const fn = unstable_cache(
    async () => {
      const [userLite, masteredCount] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, elo: true, streak: true } }),
        prisma.userMastery.count({ where: { userId } }),
      ]);
      return { user: userLite, masteredCount };
    },
    ['user-stats', userId],
    { revalidate: 15, tags: [`user-stats:${userId}`] }
  );
  return fn();
}

export async function getLecturesCached(userId: string) {
  const fn = unstable_cache(
    async () => {
      const lectures = await prisma.lecture.findMany({
        where: { userId },
        orderBy: [
          { starred: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 50,
        include: { _count: { select: { subtopics: true } } },
      });
      return lectures;
    },
    ['user-lectures', userId],
    { revalidate: 30, tags: [`user-lectures:${userId}`] }
  );
  return fn();
}


export async function getProfileForUser(userId: string, opts?: { email?: string | null; providerImage?: string | null }) {
  const [user, masteredCount, quizAgg, rank] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        image: true,
        elo: true,
        streak: true,
      },
    }),
    prisma.userMastery.count({ where: { userId } }),
    prisma.quizAttempt.groupBy({ by: ['isCorrect'], where: { userId }, _count: { _all: true } }),
    prisma.rank.findFirst({ where: { minElo: { lte: (await prisma.user.findUnique({ where: { id: userId }, select: { elo: true } }))!.elo } }, orderBy: { minElo: 'desc' } }),
  ]);
  if (!user) throw new Error('Not found');
  const total = quizAgg.reduce((acc: number, row: { _count: { _all: number } }) => acc + row._count._all, 0);
  const correct = (quizAgg.find((r: any) => r.isCorrect)?._count._all) || 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const image = user.image || opts?.providerImage || null;
  const isAdmin = !!opts?.email && (await import('@/lib/admin')).isAdminEmail(opts.email);
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio,
    image,
    elo: user.elo,
    streak: user.streak,
    masteredCount,
    quiz: { totalAttempts: total, correct, accuracy },
    rank: rank ? { slug: (rank as any).slug, name: (rank as any).name, minElo: (rank as any).minElo, iconUrl: (rank as any).iconUrl } : null,
    isAdmin,
  };
}


