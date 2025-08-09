import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export function isAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const list = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return list.includes(email.toLowerCase());
}

export async function requireAdmin() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email || null;
    if (!email || !isAdminEmail(email)) {
        const err = new Error('Forbidden') as Error & { status?: number };
        err.status = 403;
        throw err;
    }
    return session;
}


