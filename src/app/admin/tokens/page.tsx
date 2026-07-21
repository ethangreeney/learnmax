import { requireAdminPage } from '@/lib/admin';
import TokensClient from './ui/TokensClient';
import { Suspense } from 'react';

export default async function AdminTokensPage() {
  await requireAdminPage();
  return (
    <div className="container-narrow space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Token Usage</h1>
      <div className="card p-6">
        <Suspense fallback={<div>Loading...</div>}>
          <TokensClient />
        </Suspense>
      </div>
    </div>
  );
}
