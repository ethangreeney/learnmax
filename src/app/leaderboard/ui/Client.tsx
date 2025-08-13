'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { rankGradient, rankFromElo } from '@/lib/client/rank-colors';

type LBUser = {
  rank: number;
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  elo: number;
  lastActiveAt: string | null;
  rankInfo?: { slug: string; name: string; minElo: number; iconUrl: string | null } | null;
};

function getClientRank(u: LBUser) {
  if (u.rankInfo) return u.rankInfo;
  const r = rankFromElo(u.elo);
  return { slug: r.slug, name: r.name, minElo: r.minElo, iconUrl: null };
}

export default function LeaderboardClient() {
  const [scope, setScope] = useState<'global' | 'following'>('global');
  const [timeframe, setTimeframe] = useState<'all' | '30d'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<LBUser[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        scope,
        timeframe: timeframe === '30d' ? '30d' : 'all',
        limit: '50',
      });
      const res = await fetch(`/api/leaderboard?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load leaderboard');
      setUsers(data.users || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, timeframe]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-md ring-1 ring-neutral-800">
          <button
            className={`px-3 py-1 text-sm ${scope === 'global' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'}`}
            onClick={() => setScope('global')}
          >
            Global
          </button>
          <button
            className={`px-3 py-1 text-sm ${scope === 'following' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'}`}
            onClick={() => setScope('following')}
          >
            Following
          </button>
        </div>
        <div className="inline-flex overflow-hidden rounded-md ring-1 ring-neutral-800">
          <button
            className={`px-3 py-1 text-sm ${timeframe === 'all' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'}`}
            onClick={() => setTimeframe('all')}
          >
            All-time
          </button>
          <button
            className={`px-3 py-1 text-sm ${timeframe === '30d' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'}`}
            onClick={() => setTimeframe('30d')}
          >
            30 days
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6">Loading…</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-sm text-neutral-400">No users yet.</div>
        ) : (
          <ul className="divide-y divide-neutral-900">
            {users.map((u) => {
              const href = u.username
                ? `/users/${encodeURIComponent(u.username)}`
                : `/users/id/${encodeURIComponent(u.id)}`;
              return (
                <li key={u.id}>
                  <Link
                    href={href}
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-neutral-900/50"
                  >
                    <div className="w-8 pr-2 text-right text-neutral-400 tabular-nums">
                      {u.rank}
                    </div>
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-neutral-900 ring-1 ring-neutral-800">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.image}
                          alt="avatar"
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate font-medium">
                          {u.name || u.username || 'Learner'}
                        </div>
                        <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500 ring-1 ring-neutral-800">
                          #{u.rank}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {u.username ? `@${u.username}` : 'Profile'}
                        {u.lastActiveAt && (
                          <span className="ml-2">
                            • last active{' '}
                            {new Date(u.lastActiveAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {(() => {
                        const r = getClientRank(u);
                        const grad = rankGradient(r.slug);
                        return (
                          <div className="grid grid-cols-[auto,1fr] grid-rows-2 items-center gap-x-2">
                            {r.iconUrl ? (
                              <div className="relative col-start-1 row-span-2 self-center h-9 w-9 md:h-10 md:w-10">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={r.iconUrl} alt={r.name} className="absolute inset-0 h-full w-full object-contain" />
                              </div>
                            ) : (
                              <div className={`col-start-1 row-span-2 self-center h-9 w-9 md:h-10 md:w-10 rounded-md bg-gradient-to-br ${grad} shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]`} aria-hidden />
                            )}
                            <div className={`col-start-2 row-start-1 bg-gradient-to-r ${grad} bg-clip-text text-[13px] font-semibold leading-none text-transparent rank-shimmer`}>
                              {r.name}
                            </div>
                            <div className="col-start-2 row-start-2 mt-1 text-[11px] leading-none text-neutral-400">Elo {u.elo}</div>
                          </div>
                        );
                      })()}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
