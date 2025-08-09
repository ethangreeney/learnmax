import { requireAdmin } from '@/lib/admin';
import Link from 'next/link';

export default async function AdminHomePage() {
    await requireAdmin();
    return (
        <div className="container-narrow space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
            <div className="card p-6 space-y-3">
                <p className="text-neutral-400">Manage site assets and settings.</p>
                <div className="flex flex-wrap gap-3">
                    <Link href="/admin/ranks" className="btn-primary px-4 py-2">Rank Icons</Link>
                </div>
            </div>
        </div>
    );
}


