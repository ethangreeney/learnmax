import { requireAdmin } from '@/lib/admin';
import RankManagerClient from './Client';

async function getRanks() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/ranks`, { cache: 'no-store' });
    if (!res.ok) return [] as Array<{ slug: string; name: string; minElo: number; iconUrl: string | null }>;
    const data = await res.json();
    return (data.ranks || []) as Array<{ slug: string; name: string; minElo: number; iconUrl: string | null }>;
}

export default async function AdminRanksPage() {
    await requireAdmin();
    const ranks = await getRanks();
    return (
        <div className="container-narrow space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Rank Icons</h1>
            <p className="text-neutral-400">Edit thresholds and upload/change icons for each rank.</p>
            <div className="card p-6">
                <div suppressHydrationWarning>
                    {/* eslint-disable-next-line @next/next/no-sync-scripts */}
                    <script dangerouslySetInnerHTML={{ __html: `window.__RANKS__ = ${JSON.stringify(ranks)}` }} />
                </div>
                <RankManagerClient />
            </div>
        </div>
    );
}


