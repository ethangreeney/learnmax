import Image from 'next/image';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getRanksSafe, pickRankForElo, getRankGradient } from '@/lib/ranks';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import FollowButton from '../../users/[username]/FollowButton';
import RankGuide from '@/components/RankGuide';

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const uname = decodeURIComponent(username || '').toLowerCase();
  if (!uname) notFound();

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
      lastStudiedAt: true,
      _count: { select: { masteredSubtopics: true } },
    },
  });
  if (!user) notFound();

  // Viewer session and follow state
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as any)?.id as string | undefined;
  const isSelf = viewerId === user.id;

  const [ranks, agg, followerCount, followingCount, higherCount, lastAttempt] = await Promise.all([
    getRanksSafe(),
    prisma.quizAttempt.groupBy({ by: ['isCorrect'], where: { userId: user.id }, _count: { _all: true } }),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    prisma.user.count({ where: { elo: { gt: user.elo } } }),
    prisma.quizAttempt.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);
  const rank = pickRankForElo(ranks, user.elo);
  const rankColor = getRankGradient(rank?.slug);
  const total = agg.reduce((a, r) => a + r._count._all, 0);
  const correct = agg.find((r) => r.isCorrect)?._count._all || 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const lastActiveAt = user.lastStudiedAt || lastAttempt?.createdAt || null;
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
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-900 ring-1 ring-neutral-800">
              {user.image ? (
                <Image src={user.image} alt={user.name || 'avatar'} width={80} height={80} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-2xl font-semibold md:text-3xl">{user.name || user.username || 'Learner'}</h1>
                <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/70 px-3 py-1 text-xs ring-1 ring-neutral-800">
                  {rank?.iconUrl && (
                    <Image src={rank.iconUrl} alt={rank.name} width={16} height={16} className="h-4 w-4 object-contain" />
                  )}
                  <span className={`bg-gradient-to-r ${rankColor} bg-clip-text font-semibold text-transparent`}>{rank?.name || 'Unranked'}</span>
                  <span className="text-neutral-400">Elo {user.elo}</span>
                </span>
              </div>
              {user.username && <div className="text-sm text-neutral-500">@{user.username}</div>}
              {lastActiveAt && (
                <div className="mt-1 text-xs text-neutral-500">Last active {new Date(lastActiveAt).toLocaleDateString()}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isSelf && <RankGuide label="Rank Guide" initialElo={user.elo} />}
              {!isSelf && <FollowButton targetUserId={user.id} />}
            </div>
          </div>
          {user.bio && (
            <p className="mt-3 max-w-3xl text-sm text-neutral-300 whitespace-pre-wrap">{user.bio}</p>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Mastered</div>
          <div className="text-2xl font-semibold">{user._count.masteredSubtopics}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Accuracy</div>
          <div className="text-2xl font-semibold">{accuracy}%</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Streak</div>
          <div className="text-2xl font-semibold">{user.streak}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Followers</div>
          <div className="text-2xl font-semibold">{followerCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Following</div>
          <div className="text-2xl font-semibold">{followingCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-400">Leaderboard Rank</div>
          <div className="text-2xl font-semibold">#{leaderboardRank}</div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className={`bg-gradient-to-r ${rankColor} bg-clip-text text-sm font-semibold text-transparent`}>Progress to next rank</div>
            <div className="mt-1 text-xs text-neutral-400">
              {nextRank ? (
                <>
                  {toNext === 0 ? 'Rank up available' : (
                    <>Need <span className="font-medium text-neutral-200">{toNext}</span> Elo to reach <span className={`bg-gradient-to-r ${getRankGradient(nextRank?.slug)} bg-clip-text font-semibold text-transparent`}>{nextRank?.name}</span></>
                  )}
                </>
              ) : (
                'Top rank achieved'
              )}
            </div>
          </div>
          <div className="text-sm text-neutral-400">Elo {user.elo}</div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
          <div className={`h-full bg-gradient-to-r ${rankColor}`} style={{ width: `${progressPct}%` }} />
        </div>
        {nextRank && (
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-500">
            <span>{currentRank?.minElo ?? 0}</span>
            <span>{nextRank.minElo}</span>
          </div>
        )}
      </section>

      <div className="text-sm text-neutral-500">
        <Link href="/leaderboard" className="hover:underline">Back to leaderboard</Link>
      </div>
    </div>
  );
}


