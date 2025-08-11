import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const followerId = (session.user as any)?.id as string;
    const { targetUserId } = (await req.json()) as { targetUserId: string };
    if (!targetUserId || targetUserId === followerId) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }
    await prisma.follow.upsert({
      where: {
        followerId_followingId: { followerId, followingId: targetUserId },
      },
      create: { followerId, followingId: targetUserId },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const followerId = (session.user as any)?.id as string;
    const { targetUserId } = (await req.json()) as { targetUserId: string };
    if (!targetUserId || targetUserId === followerId) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }
    await prisma.follow
      .delete({
        where: {
          followerId_followingId: { followerId, followingId: targetUserId },
        },
      })
      .catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: e?.status || 500 }
    );
  }
}
