// Avoid next/image here to reduce remote domain issues in anon sessions
import RankGuide from '@/components/RankGuide';
import { getLeaderboardCached, type LeaderboardItem } from '@/lib/cached';
import { getRankGradient } from '@/lib/ranks';
import Podium from './Podium';
import LeaderboardRow from '@/components/LeaderboardRow';
import JumpToMe from './JumpToMe';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function Tabs({ period, scope }: { period: 'all' | '30d'; scope: 'global' | 'following' }) {
  const pill = 'px-3 py-1 rounded hover:bg-neutral-900/60';
  const active = 'bg-neutral-900/80 ring-1 ring-neutral-800';
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm">
        <a href={`/leaderboard?scope=global&period=${period}`} className={`${pill} ${scope === 'global' ? active : ''}`}>Global</a>
        <a href={`/leaderboard?scope=following&period=${period}`} className={`${pill} ${scope === 'following' ? active : ''}`}>Following</a>
      </div>
      <div className="h-5 w-px bg-neutral-800" />
      <div className="flex items-center gap-2 text-sm">
        <a href={`/leaderboard?scope=${scope}&period=all`} className={`${pill} ${period === 'all' ? active : ''}`}>All-time</a>
        <a href={`/leaderboard?scope=${scope}&period=30d`} className={`${pill} ${period === '30d' ? active : ''}`}>30 days</a>
      </div>
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams?: Promise<{ period?: string; scope?: string }> }) {
  const sp = (await searchParams) || {};
  const period = sp.period === '30d' ? '30d' : 'all';
  const scope: 'global' | 'following' =
    sp.scope === 'following' || sp.scope === 'friends' ? 'following' : 'global';
  const session = await getServerSession(authOptions).catch(() => null);
  const viewerId = (session as any)?.user?.id as string | undefined;
  const [items, viewer] = await Promise.all([
    getLeaderboardCached(period, scope, viewerId || null),
    viewerId
      ? prisma.user
        .findUnique({ where: { id: viewerId }, select: { elo: true } })
        .catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <div className="container-narrow space-y-6">
      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-900/80 bg-neutral-950/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
            <div className="text-sm text-neutral-500">{period === '30d' ? 'Last 30 days' : 'All-time'}</div>
          </div>
          <div className="flex items-center gap-3">
            <Tabs period={period} scope={scope} />
            <RankGuide label="Ranks" initialElo={viewer ? viewer.elo : undefined} />
            <JumpToMe meId={viewerId || null} />
          </div>
        </div>
      </div>

      <Podium top3={items.slice(0, 3)} />

      {items.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-6 text-sm text-neutral-400">
          No users yet{scope === 'following' ? '. Try Global scope to discover people.' : '.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 divide-y divide-neutral-800">
          {items.map((u, idx) => (
            <LeaderboardRow key={u.id} user={u} index={idx} isViewer={u.id === viewerId} />
          ))}
        </div>
      )}
    </div>
  );
}
