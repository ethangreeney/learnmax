import prisma from '@/lib/prisma';

export type RankDef = { slug: string; name: string; minElo: number; iconUrl: string | null };

const FALLBACK_RANKS: RankDef[] = [
    { slug: 'bronze', name: 'Bronze', minElo: 1000, iconUrl: null },
    { slug: 'silver', name: 'Silver', minElo: 1200, iconUrl: null },
    { slug: 'gold', name: 'Gold', minElo: 1400, iconUrl: null },
    { slug: 'diamond', name: 'Diamond', minElo: 1600, iconUrl: null },
    { slug: 'master', name: 'Master', minElo: 1800, iconUrl: null },
];

export async function getRanksSafe(): Promise<RankDef[]> {
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
}

export function pickRankForElo(ranks: RankDef[], elo: number): RankDef | null {
    let match: RankDef | null = null;
    for (const r of ranks) {
        if (elo >= r.minElo) match = r; else break;
    }
    return match;
}


