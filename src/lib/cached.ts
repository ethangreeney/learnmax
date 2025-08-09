import { unstable_cache } from 'next/cache';
import prisma from '@/lib/prisma';

export const getUserStatsCached = unstable_cache(
  async (userId: string) => {
    const [userLite, masteredCount] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, elo: true, streak: true } }),
      prisma.userMastery.count({ where: { userId } }),
    ]);
    return { user: userLite, masteredCount };
  },
  // Include userId in key so caches don't collide between users
  (userId: string) => ['user-stats', userId],
  { revalidate: 15 }
);

export const getLecturesCached = unstable_cache(
  async (userId: string) => {
    const lectures = await prisma.lecture.findMany({
      where: { userId },
      orderBy: [{ starred: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      include: { _count: { select: { subtopics: true } } },
    });
    return lectures;
  },
  ['user-lectures'],
  { revalidate: 30 }
);


