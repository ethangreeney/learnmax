import prisma from '@/lib/prisma';

function toUTCDateOnly(d: Date): { y: number; m: number; d: number } {
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

function isSameUTCDay(a: Date, b: Date): boolean {
  const aa = toUTCDateOnly(a);
  const bb = toUTCDateOnly(b);
  return aa.y === bb.y && aa.m === bb.m && aa.d === bb.d;
}

function isYesterdayUTC(last: Date, now: Date): boolean {
  const prev = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
  );
  return isSameUTCDay(last, prev);
}

/**
 * Bump the user's daily streak if appropriate.
 * - Same UTC day: no increment; keep streak as-is, optionally update lastStudiedAt
 * - Yesterday: increment streak by 1
 * - Older: reset streak to 1
 * Always updates `lastStudiedAt` to now when incrementing/resetting.
 */
export async function bumpDailyStreak(
  userId: string,
  now: Date = new Date()
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastStudiedAt: true, streak: true },
  });

  const last = user?.lastStudiedAt ?? null;
  const currentStreak = user?.streak ?? 0;

  if (last && isSameUTCDay(last, now)) {
    // Already counted today. If persisted streak is missing/zero, set it to 1 once.
    if (!currentStreak || currentStreak < 1) {
      await prisma.user.update({
        where: { id: userId },
        data: { streak: 1, lastStudiedAt: now },
      });
      return 1;
    }
    return currentStreak;
  }

  let nextStreak = 1;
  if (last && isYesterdayUTC(last, now)) {
    nextStreak = Math.max(1, currentStreak + 1);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { streak: nextStreak, lastStudiedAt: now },
  });

  return nextStreak;
}
