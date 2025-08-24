import { type LeaderboardItem } from '@/lib/cached';
import { getRankGradient } from '@/lib/ranks';

type PodiumProps = {
  top3: LeaderboardItem[];
};

function PodiumCard({ user, place }: { user: LeaderboardItem; place: 1 | 2 | 3 }) {
  // Note: Link to row anchor rather than profile
  const grad = getRankGradient(user.rank?.slug);
  const sizes = place === 1 ? 'h-16 w-16 md:h-20 md:w-20' : 'h-14 w-14 md:h-16 md:w-16';
  // Subtle gradient overlay for avatar
  return (
    <div
      className="group relative flex flex-col items-center rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-4 transition-colors hover:bg-neutral-900/60"
      title={user.name || user.username || ''}
   >
      <div className={`relative ${sizes} overflow-hidden rounded-full bg-neutral-900 shadow-sm`}
           style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }}>
        {/* avatar */}
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name || ''}
            className="absolute inset-0 h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-full w-full" />
        )}
        {/* Removed gradient filter overlay as requested */}
      </div>
      <div className="mt-2 text-sm font-semibold text-neutral-200 max-w-[160px] truncate">
        {user.name || 'Unnamed'}
      </div>
      <div className="text-[11px] text-neutral-400 max-w-[160px] truncate">
        {user.username ? `@${user.username}` : 'Profile'}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className={`bg-gradient-to-r ${grad} bg-clip-text text-[13px] font-semibold leading-none text-transparent rank-shimmer`}>
          {user.rank?.name || 'Unranked'}
        </div>
        <div className="text-[11px] tabular-nums text-neutral-400">Elo {user.elo}</div>
      </div>
      <div className={`pointer-events-none absolute right-2 top-2 rounded px-2 py-1 text-xs md:text-sm font-semibold ${place === 1 ? 'bg-yellow-500/10 text-yellow-400' : place === 2 ? 'bg-neutral-500/10 text-neutral-300' : 'bg-amber-700/10 text-amber-600'}`}
           aria-hidden>
        #{place}
      </div>
    </div>
  );
}

export default function Podium({ top3 }: PodiumProps) {
  if (!top3.length) return null;
  const [first, second, third] = top3;
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-4">
      {second ? (
        <div className="col-span-1 self-end">
          <PodiumCard user={second} place={2} />
        </div>
      ) : <div />}
      {first && (
        <div className="col-span-1">
          <PodiumCard user={first} place={1} />
        </div>
      )}
      {third ? (
        <div className="col-span-1 self-end">
          <PodiumCard user={third} place={3} />
        </div>
      ) : <div />}
    </div>
  );
}


