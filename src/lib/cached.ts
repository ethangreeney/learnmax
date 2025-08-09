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
    { revalidate: 15 }
  );
  return fn();
}

export async function getLecturesCached(userId: string) {
  const fn = unstable_cache(
    async () => {
      const lectures = await prisma.lecture.findMany({
        where: { userId },
        orderBy: [{ starred: 'desc' }, { createdAt: 'desc' }],
        take: 50,
        include: { _count: { select: { subtopics: true } } },
      });
      return lectures;
    },
    ['user-lectures', userId],
    { revalidate: 30 }
  );
  return fn();
}


