import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { lectureId } = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
    };
    const lid = String(lectureId || '').trim();
    if (!lid) return NextResponse.json({ error: 'lectureId required' }, { status: 400 });
    const owned = await prisma.lecture.findFirst({
      where: { id: lid, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await prisma.tutorReset.create({ data: { userId, lectureId: lid } });
    // Optionally prune in-memory state by deleting messages; keep audit by default.
    // We'll keep history and rely on reset timestamp filtering.
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}


