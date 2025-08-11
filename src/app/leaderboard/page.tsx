import { Suspense } from 'react';
import LeaderboardClient from './ui/Client';

export const dynamic = 'force-dynamic';

export default function LeaderboardPage() {
  return (
    <div className="container-narrow space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
      </div>
      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <LeaderboardClient />
      </Suspense>
    </div>
  );
}


