import { NextRequest, NextResponse } from 'next/server';
import prisma, { INTERACTIVE_TX_OPTIONS } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { revalidateTag } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { lectureId } = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
    };
    const id = String(lectureId || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'lectureId is required' }, { status: 400 });
    }

    // Verify ownership
    const lecture = await prisma.lecture.findFirst({ where: { id, userId }, select: { id: true } });
    if (!lecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const ELO_LECTURE_COMPLETE = parseInt(process.env.ELO_LECTURE_COMPLETE || '300', 10);

    const { created } = await prisma.$transaction(async (tx) => {
      try {
        await tx.userLectureCompletion.create({ data: { userId, lectureId: id } });
        if (ELO_LECTURE_COMPLETE && Number.isFinite(ELO_LECTURE_COMPLETE) && ELO_LECTURE_COMPLETE !== 0) {
          await tx.user.update({ where: { id: userId }, data: { elo: { increment: ELO_LECTURE_COMPLETE } } });
        }
        await tx.eloEvent.create({
          data: { userId, kind: 'lecture-complete', ref: id, delta: ELO_LECTURE_COMPLETE },
        });
        return { created: true };
      } catch (e: any) {
        if (e && typeof e === 'object' && (e as any).code === 'P2002') {
          return { created: false };
        }
        throw e;
      }
    }, INTERACTIVE_TX_OPTIONS);

    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true, eloIncremented: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


