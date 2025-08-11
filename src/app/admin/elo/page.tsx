import { requireAdmin } from '@/lib/admin';
import EloClient from './ui/Client';

export default async function AdminEloPage() {
    await requireAdmin();
    return (
        <div className="container-narrow space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Adjust My Elo</h1>
            <div className="card p-6">
                <EloClient />
            </div>
        </div>
    );
}


