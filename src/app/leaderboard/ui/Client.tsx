'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type LBUser = {
  rank: number;
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  elo: number;
  lastActiveAt: string | null;
};

function getTier(elo: number): { name: string; gradient: string } {
  if (elo >= 2000) return { name: 'Legend', gradient: 'from-yellow-300 via-amber-200 to-rose-300' };
  if (elo >= 1700) return { name: 'Master', gradient: 'from-purple-300 via-indigo-300 to-cyan-300' };
  if (elo >= 1400) return { name: 'Expert', gradient: 'from-green-300 via-emerald-300 to-teal-300' };
  if (elo >= 1200) return { name: 'Skilled', gradient: 'from-blue-300 via-cyan-300 to-sky-300' };
  return { name: 'Learner', gradient: 'from-neutral-300 via-neutral-200 to-neutral-100' };
}

export default function LeaderboardClient() {
  const [scope, setScope] = useState<'global' | 'friends'>('global');
  const [timeframe, setTimeframe] = useState<'all' | '30d'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<LBUser[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ scope, timeframe: timeframe === '30d' ? '30d' : 'all', limit: '50' });
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
        <div className="inline-flex rounded-md overflow-hidden ring-1 ring-neutral-800">
          <button
            className={`px-3 py-1 text-sm ${scope === 'global' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'}`}
            onClick={() => setScope('global')}
          >
            Global
          </button>
          <button
            className={`px-3 py-1 text-sm ${scope === 'friends' ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'}`}
            onClick={() => setScope('friends')}
          >
            Friends
          </button>
        </div>
        <div className="inline-flex rounded-md overflow-hidden ring-1 ring-neutral-800">
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
          <div className="p-6 text-red-400 text-sm">{error}</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-sm text-neutral-400">No users yet.</div>
        ) : (
          <ul className="divide-y divide-neutral-900">
            {users.map((u) => {
              const href = u.username ? `/users/${encodeURIComponent(u.username)}` : `/users/id/${encodeURIComponent(u.id)}`;
              return (
                <li key={u.id}>
                  <Link href={href} className="flex items-center gap-4 p-4 hover:bg-neutral-900/50 transition-colors">
                    <div className="w-8 text-right pr-2 tabular-nums text-neutral-400">{u.rank}</div>
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-neutral-900 ring-1 ring-neutral-800">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.image} alt="avatar" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="h-full w-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-medium truncate">{u.name || u.username || 'Learner'}</div>
                        <span className="text-[10px] text-neutral-500 bg-neutral-900 rounded px-1.5 py-0.5 ring-1 ring-neutral-800">#{u.rank}</span>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {u.username ? `@${u.username}` : 'Profile'}
                        {u.lastActiveAt && (
                          <span className="ml-2">• last active {new Date(u.lastActiveAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {(() => {
                        const { name, gradient } = getTier(u.elo);
                        return (
                          <span className={`inline-flex items-center gap-2 rounded-full bg-neutral-900/70 ring-1 ring-neutral-800 px-3 py-1 text-xs`}>
                            <span className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent font-semibold`}>{name}</span>
                            <span className="text-neutral-400">Elo {u.elo}</span>
                          </span>
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


