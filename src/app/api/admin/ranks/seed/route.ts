import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export async function POST() {
  await requireAdmin();
  // Ensure Rank table exists (idempotent) before upserting
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
    // ignore - table may already exist or permissions may differ
  }
  const defaults = [
    { slug: 'bronze', name: 'Bronze', minElo: 1000 },
    { slug: 'silver', name: 'Silver', minElo: 1200 },
    { slug: 'gold', name: 'Gold', minElo: 1400 },
    { slug: 'diamond', name: 'Diamond', minElo: 1600 },
    { slug: 'master', name: 'Master', minElo: 1800 },
  ];
  for (const r of defaults) {
    await prisma.rank.upsert({
      where: { slug: r.slug },
      update: { name: r.name, minElo: r.minElo },
      create: r,
    });
  }
  return NextResponse.json({ ok: true });
}
