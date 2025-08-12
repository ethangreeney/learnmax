import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const { subtopicId } = (await req.json().catch(() => ({}))) as {
      subtopicId?: string;
    };
    const sid = String(subtopicId || '').trim();
    if (!sid) return NextResponse.json({ error: 'subtopicId required' }, { status: 400 });

    // Verify ownership
    const owned = await prisma.subtopic.findFirst({
      where: { id: sid, lecture: { userId } },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Record reset marker. We intentionally DO NOT delete attempts or progress for auditability.
    await prisma.quizReset.create({ data: { userId, subtopicId: sid } });
    // Also clear current visible progress so UI resets immediately
    await prisma.quizProgress.deleteMany({ where: { userId, subtopicId: sid } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}


