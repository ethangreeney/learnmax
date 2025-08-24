import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import prisma from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
 
import { generateOpaqueToken } from '@/lib/shared/token';

export const runtime = 'nodejs';

type Params = { lectureId: string };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { lectureId } = await ctx.params;
    const userId = session.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      discoverable?: boolean;
      regenerate?: boolean;
    };
    const owned = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true, shareToken: true },
    });
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let token = owned.shareToken || null;
    if (!token || body?.regenerate) {
      token = generateOpaqueToken(48);
    }
    const discoverable = Boolean(body?.discoverable);
    const now = new Date();
    const updated = await prisma.lecture.update({
      where: { id: lectureId },
      data: {
        shareToken: token,
        sharedAt: now,
        shareRevokedAt: null,
        isDiscoverable: discoverable,
      },
      select: {
        id: true,
        shareToken: true,
        isDiscoverable: true,
      },
    });

    try { revalidateTag(`user-lectures:${userId}`); } catch {}

    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || '';
    const origin = base ? (base.startsWith('http') ? base : `https://${base}`) : req.nextUrl.origin;
    const shareUrl = `${origin}/lectures/share/${updated.shareToken}`;
    try {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lecture.share.created', lectureId, discoverable }),
      }).catch(() => {});
    } catch {}

    return NextResponse.json({ shareUrl, token: updated.shareToken, discoverable: updated.isDiscoverable });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { lectureId } = await ctx.params;
    const userId = session.user.id;
    const owned = await prisma.lecture.findFirst({ where: { id: lectureId, userId }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = await prisma.lecture.update({
      where: { id: lectureId },
      data: { shareRevokedAt: new Date(), shareToken: null },
      select: { id: true },
    });
    try { revalidateTag(`user-lectures:${userId}`); } catch {}
    try {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lecture.share.revoked', lectureId }),
      });
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


