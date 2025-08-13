import Image from 'next/image';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import Link from 'next/link';
import FollowButton from '../../[username]/FollowButton';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getRanksSafe, pickRankForElo, getRankGradient } from '@/lib/ranks';
import { getUserStatsCached } from '@/lib/cached';

export default async function PublicProfileById({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      bio: true,
      image: true,
      elo: true,
      streak: true,
      lastStudiedAt: true,
      _count: { select: { masteredSubtopics: true } },
    },
  });
  if (!user) return notFound();

  // Determine if viewer is the same user
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as any)?.id as string | undefined;
  const isSelf = viewerId === user.id;
  const [agg, ranks, followerCount, followingCount, higherCount, lastAttempt, stats] = await Promise.all([
    prisma.quizAttempt.groupBy({ by: ['isCorrect'], where: { userId: user.id }, _count: { _all: true } }),
    getRanksSafe(),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    prisma.user.count({ where: { elo: { gt: user.elo } } }),
    prisma.quizAttempt.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    getUserStatsCached(user.id),
  ]);
  const total = agg.reduce((a, r) => a + r._count._all, 0);
  const correct = agg.find((r) => r.isCorrect)?._count._all || 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const lastActiveAt = user.lastStudiedAt || lastAttempt?.createdAt || null;
  const lifetimeLectures = (stats as any)?.lifetime?.lecturesCreated ?? (stats as any)?.lectureCount ?? 0;
  const highestElo = user.elo;
  const lifetimeMastered = (stats as any)?.lifetime?.subtopicsMastered ?? (stats as any)?.masteredCount ?? user._count.masteredSubtopics;

  // Rank data and progress
  const rank = pickRankForElo(ranks, user.elo);
  const rankColor = getRankGradient(rank?.slug);
  const sorted = [...ranks].sort((a, b) => a.minElo - b.minElo);
  const currentIndex = (() => {
    let idx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (user.elo >= sorted[i].minElo) idx = i; else break;
    }
    return idx;
  })();
  const currentRank = sorted[currentIndex] ?? null;
  const nextRank = sorted[currentIndex + 1] ?? null;
  const toNext = nextRank ? Math.max(0, nextRank.minElo - user.elo) : null;
  const denom = nextRank ? Math.max(1, nextRank.minElo - (currentRank?.minElo ?? 0)) : 1;
  const progressPct = nextRank ? Math.max(0, Math.min(100, ((user.elo - (currentRank?.minElo ?? 0)) / denom) * 100)) : 100;
  const leaderboardRank = higherCount + 1;

  return (
    <div className="container-narrow space-y-8">
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full hero-spotlight" />
          <div className="absolute inset-0 opacity-[0.35] hero-grid" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        </div>
        <div className="relative z-10 p-6 md:p-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="relative top-[2px] self-start">
                <div className="relative h-24 w-24 rounded-full">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/50 via-emerald-400/30 to-emerald-300/20 blur-sm" />
                  <div className="relative h-full w-full overflow-hidden rounded-full bg-neutral-950 ring-2 ring-neutral-800">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="avatar" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-500" />
                    )}
                  </div>
                </div>
              </div>
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{user.name || user.username || 'Learner'}</h1>
                  {user.username && (
                    <span className="rounded-full bg-neutral-900/70 px-2.5 py-0.5 text-xs text-neutral-300 ring-1 ring-neutral-800">@{user.username}</span>
                  )}
                </div>
                {lastActiveAt && (
                  <div className="mt-1 text-xs text-neutral-500">Last active {new Date(lastActiveAt).toLocaleDateString()}</div>
                )}
                {!isSelf && (
                  <div className="mt-3">
                    <FollowButton targetUserId={user.id} />
                  </div>
                )}
                {/* Mobile rank */}
                <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
                  <div className="flex shrink-0 flex-col items-center gap-2 px-1">
                    {rank?.iconUrl ? (
                      <Image src={rank.iconUrl} alt={rank.name} width={72} height={72} className="relative top-[6px] h-[72px] w-[72px] object-contain" />
                    ) : null}
                    <div className={`relative top-[4px] bg-gradient-to-r ${rankColor} bg-clip-text text-sm font-semibold leading-tight text-transparent rank-shimmer`}>
                      {rank?.name || 'Unranked'}
                    </div>
                    <div className="text-xs leading-tight text-neutral-400">Elo {user.elo}</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Desktop right-side rank panel with progress bar */}
            <div className="relative top-[4px] hidden shrink-0 items-center gap-6 md:flex">
              <div className="w-56">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span>{currentRank ? currentRank.name : 'Unranked'}</span>
                    <span className="text-neutral-500">{nextRank ? nextRank.name : 'Max'}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-900">
                    <div className={`h-full bg-gradient-to-r ${rankColor}`} style={{ width: `${progressPct}%`, transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)' }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                    <span>{currentRank?.minElo ?? 0}</span>
                    <span>{nextRank?.minElo ?? user.elo}</span>
                  </div>
                  {toNext != null && (
                    <div className="text-[11px] text-neutral-400">{toNext} pts to next rank</div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-2 px-1">
                {rank?.iconUrl ? (
                  <Image src={rank.iconUrl} alt={rank.name} width={72} height={72} className="relative top-[6px] h-[72px] w-[72px] object-contain" />
                ) : null}
                <div className={`relative top-[4px] bg-gradient-to-r ${rankColor} bg-clip-text text-sm font-semibold leading-tight text-transparent rank-shimmer`}>
                  {rank?.name || 'Unranked'}
                </div>
                <div className="text-xs leading-tight text-neutral-400">Elo {user.elo}</div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {user.bio && (
        <section className="card p-6">
          <h2 className="mb-2 text-xl font-semibold">Bio</h2>
          <p className="text-neutral-300 whitespace-pre-wrap">{user.bio}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Subtopics Mastered</div>
          <div className="text-2xl font-semibold">{lifetimeMastered}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Accuracy</div>
          <div className="text-2xl font-semibold">{correct}/{total}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Streak</div>
          <div className="text-2xl font-semibold">{user.streak}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Lectures Created (Lifetime)</div>
          <div className="text-2xl font-semibold">{lifetimeLectures}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Highest Elo (All‑time)</div>
          <div className="text-2xl font-semibold">{highestElo}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Leaderboard Rank</div>
          <div className="text-2xl font-semibold">#{leaderboardRank}</div>
        </div>
      </section>



      <div className="text-sm text-neutral-500">
        <Link href="/leaderboard" className="hover:underline">
          Back to leaderboard
        </Link>
      </div>
    </div>
  );
}
