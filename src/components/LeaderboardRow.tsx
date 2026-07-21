'use client';

import { useMemo } from 'react';
import { getRankGradient } from '@/lib/ranks';
import type { LeaderboardItem } from '@/lib/cached';
import { formatDateUTC } from '@/lib/text/format-date';

type LeaderboardRowProps = {
  user: LeaderboardItem;
  index: number; // zero-based
  isViewer?: boolean;
};

export default function LeaderboardRow({ user, index, isViewer }: LeaderboardRowProps) {
  const rankNumber = index + 1;
  const href = user.username ? `/u/${user.username}` : `/u/id/${user.id}`;
  const grad = getRankGradient(user.rank?.slug);

  // copy/follow removed

  const trophyClass = useMemo(() => {
    if (rankNumber === 1) return 'text-yellow-400';
    if (rankNumber === 2) return 'text-neutral-300';
    if (rankNumber === 3) return 'text-amber-600';
    return '';
  }, [rankNumber]);

  return (
    <div id={`user-${user.id}`} className="relative">
      <a
        href={href}
        className="group relative flex items-stretch justify-between gap-3 px-4 py-4 transition-colors hover:bg-neutral-900/50 md:px-6"
      >
        <div className="absolute left-0 top-0 h-full w-[3px] bg-neutral-800 group-hover:bg-neutral-700" aria-hidden />
        <div className="flex min-w-0 items-center gap-4 self-center">
          <div className={`w-8 text-center tabular-nums ${trophyClass || 'text-neutral-400'}`}>{rankNumber}</div>
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-neutral-900 ring-2 ring-neutral-800">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name || ''}
                className="absolute inset-0 h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-full w-full" />)
            }
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-lg font-semibold text-neutral-200">{user.name || 'Unnamed'}</div>
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-400 ring-1 ring-neutral-800">#{rankNumber}{isViewer ? ' · You' : ''}</span>
            </div>
            <div className="text-sm text-neutral-500">
              {user.username ? `@${user.username}` : 'Profile'}
              <span className="opacity-50"> · </span>
              <span>last active {user.lastActiveISO ? formatDateUTC(user.lastActiveISO) : '—'}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 self-stretch">
          <div className="flex flex-col items-end justify-center text-right">
            <div className={`bg-gradient-to-r ${grad} bg-clip-text text-[13px] font-semibold leading-none text-transparent rank-shimmer`}>
              {user.rank?.name || 'Unranked'}
            </div>
            <div className="mt-1 text-[11px] leading-none text-neutral-400">Elo {user.elo}</div>
          </div>
          {user.rank?.iconUrl ? (
            <div className="flex w-16 self-stretch items-center justify-center md:w-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.rank.iconUrl} alt={user.rank.name} className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className={`h-full w-16 md:w-20 rounded-md bg-gradient-to-br ${grad} shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]`} aria-hidden />
          )}
        </div>
      </a>
    </div>
  );
}

