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
    const { lectureId, subtopicId } = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      subtopicId?: string;
    };
    const lid = String(lectureId || '').trim();
    const sid = String(subtopicId || '').trim();
    if (!lid)
      return NextResponse.json(
        { error: 'lectureId required' },
        { status: 400 }
      );
    const owned = await prisma.lecture.findFirst({
      where: {
        id: lid,
        userId,
        ...(sid ? { subtopics: { some: { id: sid } } } : {}),
      },
      select: { id: true },
    });
    if (!owned)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (sid) {
      await prisma.tutorMessage.deleteMany({
        where: {
          userId,
          lectureId: lid,
          role: { in: ['user', 'ai'] },
          refs: { path: ['subtopicId'], equals: sid },
        },
      });
    } else {
      await prisma.tutorReset.create({ data: { userId, lectureId: lid } });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
