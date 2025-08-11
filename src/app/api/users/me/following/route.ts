import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await requireSession();
    const meId = (session.user as any)?.id as string;
    const rows = await prisma.follow.findMany({
      where: { followerId: meId },
      select: { followingId: true },
    });
    return NextResponse.json({ following: rows.map((r) => r.followingId) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
