import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import Link from 'next/link';
import FollowButton from '../../[username]/FollowButton';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function PublicProfileById({ params }: { params: Promise<{ userId: string }> }) {
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
      _count: { select: { masteredSubtopics: true } },
    },
  });
  if (!user) return notFound();

  // Determine if viewer is the same user
  const session = await getServerSession(authOptions);
  const viewerId = (session?.user as any)?.id as string | undefined;
  const isSelf = viewerId === user.id;
  const agg = await prisma.quizAttempt.groupBy({
    by: ['isCorrect'],
    where: { userId: user.id },
    _count: { _all: true },
  });
  const total = agg.reduce((a, r) => a + r._count._all, 0);
  const correct = agg.find((r) => r.isCorrect)?._count._all || 0;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const lastAttempt = await prisma.quizAttempt.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const lastActiveAt = lastAttempt?.createdAt || null;

  // Rank pill styling to match profile page
  const elo = user.elo || 0;
  const tier = elo >= 2000 ? 'Legend' : elo >= 1700 ? 'Master' : elo >= 1400 ? 'Expert' : elo >= 1200 ? 'Skilled' : 'Learner';
  const tierColor =
    elo >= 2000
      ? 'from-yellow-300 via-amber-200 to-rose-300'
      : elo >= 1700
      ? 'from-purple-300 via-indigo-300 to-cyan-300'
      : elo >= 1400
      ? 'from-green-300 via-emerald-300 to-teal-300'
      : elo >= 1200
      ? 'from-blue-300 via-cyan-300 to-sky-300'
      : 'from-neutral-300 via-neutral-200 to-neutral-100';

  return (
    <div className="container-narrow space-y-8">
      <div className="card p-6 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full overflow-hidden bg-neutral-900 ring-1 ring-neutral-800">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="avatar" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold truncate">{user.name || user.username || 'Learner'}</h1>
            <span className={`inline-flex items-center gap-2 rounded-full bg-neutral-900/70 ring-1 ring-neutral-800 px-3 py-1 text-xs`}>
              <span className={`bg-gradient-to-r ${tierColor} bg-clip-text text-transparent font-semibold`}>{tier}</span>
              <span className="text-neutral-400">Elo {user.elo}</span>
            </span>
          </div>
          {user.username && <div className="text-sm text-neutral-500">@{user.username}</div>}
          {lastActiveAt && (
            <div className="text-xs text-neutral-500 mt-1">Last active {lastActiveAt.toLocaleDateString()}</div>
          )}
          {user.bio && <p className="mt-2 text-sm text-neutral-300">{user.bio}</p>}
        </div>
        {!isSelf && (
          <div className="shrink-0">
            <FollowButton targetUserId={user.id} />
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>
      <div className="text-sm text-neutral-500">
        <Link href="/leaderboard" className="hover:underline">Back to leaderboard</Link>
      </div>
    </div>
  );
}


