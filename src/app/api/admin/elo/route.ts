import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { revalidateTag } from 'next/cache';

export async function POST(req: Request) {
    try {
        const session = await requireAdmin();
        const userId = (session.user as any)?.id as string;
        const body = await req.json().catch(() => ({}));
        const elo = Number(body?.elo);
        if (!Number.isFinite(elo) || elo < 0) {
            return NextResponse.json({ error: 'Invalid elo' }, { status: 400 });
        }

        const user = await prisma.user.update({ where: { id: userId }, data: { elo: Math.round(elo) } });

        // Invalidate leaderboard caches for both periods/scopes for this viewer
        try {
            revalidateTag(`leaderboard:all:global:${userId}`);
            revalidateTag(`leaderboard:all:friends:${userId}`);
            revalidateTag(`leaderboard:30d:global:${userId}`);
            revalidateTag(`leaderboard:30d:friends:${userId}`);
        } catch { }

        return NextResponse.json({ ok: true, user: { id: user.id, elo: user.elo } });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
    }
}


