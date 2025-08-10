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
          // Most recently opened first; fallback to createdAt below if nulls remain
          { lastOpenedAt: 'desc' },
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


