import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export async function GET() {
    const ranks = await prisma.rank.findMany({ orderBy: { minElo: 'asc' } });
    return NextResponse.json({ ranks });
}

export async function PATCH(req: Request) {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.ranks) ? (body.ranks as any[]) : [];
    for (const it of items) {
        if (!it || typeof it.slug !== 'string') continue;
        const data: any = {};
        if (typeof it.name === 'string') data.name = it.name.trim().slice(0, 40);
        if (Number.isInteger(it.minElo)) data.minElo = Math.max(0, Number(it.minElo));
        if (typeof it.iconUrl === 'string' || it.iconUrl === null) data.iconUrl = it.iconUrl ?? null;
        if (Object.keys(data).length) {
            await prisma.rank.update({ where: { slug: it.slug }, data });
        }
    }
    const ranks = await prisma.rank.findMany({ orderBy: { minElo: 'asc' } });
    return NextResponse.json({ ok: true, ranks });
}


