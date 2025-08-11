import { requireAdmin } from '@/lib/admin';
import { getRanksSafe } from '@/lib/ranks';
import RankManagerClient from './Client';

async function getRanks() {
  // Query DB directly to avoid server-fetching relative URLs
  const ranks = await getRanksSafe();
  return (ranks as any[]) as Array<{
    slug: string;
    name: string;
    minElo: number;
    iconUrl: string | null;
  }>;
}

export default async function AdminRanksPage() {
  await requireAdmin();
  const ranks = await getRanks();
  return (
    <div className="container-narrow space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Rank Icons</h1>
      <p className="text-neutral-400">
        Edit thresholds and upload/change icons for each rank.
      </p>
      <div className="card p-6">
        <RankManagerClient initialRanks={ranks} />
      </div>
    </div>
  );
}
