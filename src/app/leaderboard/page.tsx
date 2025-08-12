import Image from 'next/image';
import RankGuide from '@/components/RankGuide';
import { getLeaderboardCached, type LeaderboardItem } from '@/lib/cached';
import { getRankGradient } from '@/lib/ranks';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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
  const items: LeaderboardItem[] = await getLeaderboardCached(period, scope, viewerId || null);

  return (
    <div className="container-narrow space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        <div className="flex items-center gap-3">
          <Tabs period={period} scope={scope} />
          <RankGuide label="Ranks" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 divide-y divide-neutral-800">
        {items.map((u, idx) => (
          <div key={u.id} className="flex items-center justify-between px-4 py-4 md:px-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-8 text-center text-neutral-400 tabular-nums">{idx + 1}</div>
              <div className="relative h-10 w-10 overflow-hidden rounded-full bg-neutral-900 ring-2 ring-neutral-800">
                {u.image ? (
                  <Image
                    src={u.image}
                    alt={u.name || ''}
                    fill
                    sizes="40px"
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-full w-full" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <a
                    href={u.username ? `/u/${u.username}` : `/u/id/${u.id}`}
                    className="truncate text-lg font-semibold hover:underline"
                  >
                    {u.name || 'Unnamed'}
                  </a>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 ring-1 ring-neutral-800 text-neutral-400">#{idx + 1}</span>
                </div>
                <div className="text-sm text-neutral-500 flex items-center gap-2">
                  {u.username ? <a href={`/u/${u.username}`} className="hover:underline">@{u.username}</a> : <span>—</span>}
                  <span className="opacity-50">•</span>
                  <span>last active {u.lastActiveISO ? new Date(u.lastActiveISO).toLocaleDateString() : '—'}</span>
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/70 ring-1 ring-neutral-800 px-3 py-1 text-xs">
                {u.rank?.iconUrl && (
                  <Image src={u.rank.iconUrl} alt={u.rank.name} width={14} height={14} className="h-3.5 w-3.5 object-contain" unoptimized />
                )}
                <span className={`bg-gradient-to-r ${getRankGradient(u.rank?.slug)} bg-clip-text text-transparent font-semibold rank-shimmer`}>
                  {u.rank?.name || 'Unranked'}
                </span>
                <span className="text-neutral-400">Elo {u.elo}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
