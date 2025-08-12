import prisma from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

export type RankDef = { slug: string; name: string; minElo: number; iconUrl: string | null };

const FALLBACK_RANKS: RankDef[] = [
    { slug: 'bronze', name: 'Bronze', minElo: 0, iconUrl: null },
    { slug: 'silver', name: 'Silver', minElo: 400, iconUrl: null },
    { slug: 'gold', name: 'Gold', minElo: 800, iconUrl: null },
    { slug: 'diamond', name: 'Diamond', minElo: 1200, iconUrl: null },
    { slug: 'master', name: 'Master', minElo: 1600, iconUrl: null },
];

export async function getRanksSafe(): Promise<RankDef[]> {
    const fn = unstable_cache(
        async () => {
            try {
                // Check if the Rank table exists (Postgres specific); if it doesn't, fall back silently
                const check = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Rank') AS exists;"
                );
                const exists = Array.isArray(check) && !!check[0]?.exists;
                if (!exists) return FALLBACK_RANKS;
                const rows = await prisma.rank.findMany({ orderBy: { minElo: 'asc' } });
                if (!rows?.length) return FALLBACK_RANKS;
                return rows.map((r) => ({ slug: (r as any).slug, name: (r as any).name, minElo: (r as any).minElo, iconUrl: (r as any).iconUrl }));
            } catch {
                return FALLBACK_RANKS;
            }
        },
        ['ranks-all'],
        { revalidate: 3600, tags: ['ranks'] }
    );
    return fn();
}

export function pickRankForElo(ranks: RankDef[], elo: number): RankDef | null {
    let match: RankDef | null = null;
    for (const r of ranks) {
        if (elo >= r.minElo) match = r; else break;
    }
    return match;
}

/**
 * Return a Tailwind gradient class for a given rank slug.
 * This is used to render the gradient text color consistently
 * wherever we display rank names (profile, leaderboard, etc.).
 */
export function getRankGradient(slug?: string | null): string {
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


