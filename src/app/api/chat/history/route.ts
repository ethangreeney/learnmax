import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import prisma from '@/lib/prisma';

// GET /api/chat/history?lectureId=...
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const url = new URL(req.url);
    const lectureId = String(url.searchParams.get('lectureId') || '').trim();
    if (!lectureId) {
      return NextResponse.json(
        { error: 'lectureId is required' },
        { status: 400 }
      );
    }

    // Ownership check
    const owned = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const lastReset = await prisma.tutorReset.findFirst({
      where: { userId, lectureId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const messages = await prisma.tutorMessage.findMany({
      where: {
        userId,
        lectureId,
        ...(lastReset ? { createdAt: { gt: lastReset.createdAt } } : {}),
      },
      select: { role: true, text: true, refs: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ messages });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}


