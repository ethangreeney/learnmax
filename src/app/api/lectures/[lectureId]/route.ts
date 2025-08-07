// NOTE: Auto-fixed by fix-next15-types.sh
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Keep the 2nd arg loosely typed and narrow safely to avoid Next 15 typing issues.
type Params = { lectureId: string };

export async function PATCH(req: NextRequest, ctx: unknown) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { params } = (ctx as { params: Params }) || {
      params: { lectureId: '' },
    };
    const { lectureId } = params;

    const userId = (session.user as any).id as string;
    const { title } = await req.json();

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return NextResponse.json(
        { error: 'Title must be at least 3 characters' },
        { status: 400 }
      );
    }

    const owned = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.lecture.update({
      where: { id: lectureId },
      data: { title: title.trim() },
      select: { id: true, title: true },
    });

    return NextResponse.json({ ok: true, lecture: updated });
  } catch (e: any) {
    console.error('LECTURE_PATCH_ERROR', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
