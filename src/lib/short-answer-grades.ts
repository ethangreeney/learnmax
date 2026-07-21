import prisma from '@/lib/prisma';

type PersistBestGradeInput = {
  userId: string;
  lectureId: string | null;
  promptHash: string;
  score: number;
};

/**
 * Persists the best server-issued grade for a prompt without allowing a later
 * retry to lower it. The upsert handles concurrent first submissions and the
 * conditional update keeps subsequent writes monotonic.
 */
export async function persistBestShortAnswerGrade({
  userId,
  lectureId,
  promptHash,
  score,
}: PersistBestGradeInput): Promise<number> {
  const safeScore = Math.max(0, Math.min(10, Math.trunc(score)));
  const existing = await prisma.shortAnswerGrade.upsert({
    where: { userId_promptHash: { userId, promptHash } },
    create: {
      userId,
      lectureId,
      promptHash,
      score: safeScore,
    },
    update: {
      promptHash,
      ...(lectureId ? { lectureId } : {}),
    },
    select: { id: true, score: true },
  });

  if (safeScore > existing.score) {
    await prisma.shortAnswerGrade.updateMany({
      where: { id: existing.id, score: { lt: safeScore } },
      data: {
        score: safeScore,
        ...(lectureId ? { lectureId } : {}),
      },
    });
  }

  return Math.max(existing.score, safeScore);
}
