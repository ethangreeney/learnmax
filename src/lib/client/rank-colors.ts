export type RankSlug = 'bronze' | 'silver' | 'gold' | 'diamond' | 'master';

export type RankInfo = { slug: RankSlug; name: string; minElo: number };

// Keep in sync with server fallback thresholds in src/lib/ranks.ts
export const RANKS_FALLBACK: RankInfo[] = [
  { slug: 'bronze', name: 'Bronze', minElo: 0 },
  { slug: 'silver', name: 'Silver', minElo: 400 },
  { slug: 'gold', name: 'Gold', minElo: 800 },
  { slug: 'diamond', name: 'Diamond', minElo: 1200 },
  { slug: 'master', name: 'Master', minElo: 1600 },
];

export function rankFromElo(elo: number): RankInfo {
  let current = RANKS_FALLBACK[0];
  for (const r of RANKS_FALLBACK) {
    if (elo >= r.minElo) current = r;
    else break;
  }
  return current;
}

export function rankGradient(slug?: string | null): string {
  switch (slug) {
    case 'bronze':
      return 'from-amber-700 via-orange-500 to-yellow-300';
    case 'silver':
      return 'from-zinc-500 via-zinc-300 to-white';
    case 'gold':
      return 'from-yellow-700 via-amber-400 to-yellow-200';
    case 'diamond':
      return 'from-cyan-700 via-sky-400 to-indigo-200';
    case 'master':
      return 'from-fuchsia-700 via-purple-500 to-rose-300';
    default:
      return 'from-neutral-400 via-neutral-200 to-white';
  }
}


