import { requireAdmin } from '@/lib/admin';
import TokensClient from './ui/TokensClient';

export default async function AdminTokensPage() {
  await requireAdmin();
  return (
    <div className="container-narrow space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Token Usage</h1>
      <div className="card p-6">
        <TokensClient />
      </div>
    </div>
  );
}


