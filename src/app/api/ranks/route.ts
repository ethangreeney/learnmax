import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRanksSafe } from '@/lib/ranks';
import { requireAdmin } from '@/lib/admin';
import { revalidateTag } from 'next/cache';

export async function GET() {
  const ranks = await getRanksSafe();
  return NextResponse.json({ ranks });
}

export async function PATCH(req: Request) {
  await requireAdmin();
  // Ensure Rank table exists to avoid failures on fresh databases
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Rank" (
        "slug" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "minElo" INTEGER NOT NULL,
        "iconUrl" TEXT
      );
    `);
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Rank_minElo_key" ON "Rank" ("minElo");'
    );
  } catch {
    // ignore
  }
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.ranks) ? (body.ranks as any[]) : [];
  for (const it of items) {
    if (!it || typeof it.slug !== 'string') continue;
    const slug = String(it.slug).trim();
    const updateData: any = {};
    const createData: any = { slug };
    if (typeof it.name === 'string') {
      const name = it.name.trim().slice(0, 40);
      updateData.name = name;
      createData.name = name || slug;
    }
    if (Number.isInteger(it.minElo)) {
      const minElo = Math.max(0, Number(it.minElo));
      updateData.minElo = minElo;
      createData.minElo = minElo;
    }
    if (typeof it.iconUrl === 'string' || it.iconUrl === null) {
      updateData.iconUrl = it.iconUrl ?? null;
      createData.iconUrl = it.iconUrl ?? null;
    }
    // Ensure we at least set required fields on create
    if (createData.name == null) createData.name = slug;
    if (createData.minElo == null) createData.minElo = 0;

    await prisma.rank.upsert({
      where: { slug },
      update: updateData,
      create: createData,
    });
  }
  const ranks = await prisma.rank.findMany({ orderBy: { minElo: 'asc' } });
  try { revalidateTag('ranks'); } catch { }
  return NextResponse.json({ ok: true, ranks });
}
