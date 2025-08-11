import { isSessionWithUser } from '@/lib/session-utils';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { revalidateTag } from 'next/cache';
import { authOptions } from '@/lib/auth';

type Params = { lectureId: string };

export async function PATCH(
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

    const body = await req.json().catch(() => ({}) as any);
    const { title, starred } = body as { title?: string; starred?: boolean };
    const data: Record<string, any> = {};
    if (typeof title !== 'undefined') {
      if (!title || typeof title !== 'string' || title.trim().length < 3) {
        return NextResponse.json(
          { error: 'Title must be at least 3 characters' },
          { status: 400 }
        );
      }
      data.title = title.trim();
    }
    if (typeof starred !== 'undefined') {
      if (typeof starred !== 'boolean') {
        return NextResponse.json(
          { error: 'Invalid starred value' },
          { status: 400 }
        );
      }
      data.starred = starred;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
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
      data,
      select: { id: true, title: true, starred: true },
    });
    try {
      revalidateTag(`user-lectures:${userId}`);
    } catch {}
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true, lecture: updated });
  } catch (e: any) {
    console.error('LECTURE_PATCH_ERROR', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Ensure the lecture belongs to the current user
    const owned = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Cascade deletes will remove related Subtopics, QuizQuestions, and UserMastery via Prisma schema
    await prisma.lecture.delete({ where: { id: lectureId } });
    try {
      revalidateTag(`user-lectures:${userId}`);
    } catch {}
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('LECTURE_DELETE_ERROR', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
