import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

// GET: return progress for current user and subtopic, filtered after last reset
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const url = new URL(req.url);
    const subtopicId = String(url.searchParams.get('subtopicId') || '').trim();
    if (!subtopicId) {
      return NextResponse.json(
        { error: 'subtopicId is required' },
        { status: 400 }
      );
    }

    // Verify ownership of subtopic
    const owned = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lecture: { userId } },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only include progress updated after the latest reset, if any
    const lastReset = await prisma.quizReset.findFirst({
      where: { userId, subtopicId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const progress = await prisma.quizProgress.findMany({
      where: {
        userId,
        subtopicId,
        ...(lastReset
          ? { updatedAt: { gt: lastReset.createdAt } }
          : {}),
      },
      select: {
        questionId: true,
        selectedIndex: true,
        revealed: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
    });

    return NextResponse.json({ progress });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}

// POST: upsert per-question selection state and revealed flag
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const body = (await req.json().catch(() => ({}))) as {
      subtopicId?: string;
      updates?: Array<{
        questionId: string;
        selectedIndex?: number | null;
        revealed?: boolean;
      }>;
    };
    const subtopicId = String(body?.subtopicId || '').trim();
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (!subtopicId || updates.length === 0) {
      return NextResponse.json(
        { error: 'subtopicId and updates are required' },
        { status: 400 }
      );
    }

    // Verify ownership of subtopic
    const owned = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lecture: { userId } },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Filter only valid question IDs under this subtopic
    const validQuestions = await prisma.quizQuestion.findMany({
      where: { subtopicId },
      select: { id: true },
    });
    const valid = new Set(validQuestions.map((q) => q.id));
    const tasks = updates
      .filter((u) => u && typeof u.questionId === 'string' && valid.has(u.questionId))
      .map((u) => {
        const hasSel = typeof u.selectedIndex === 'number' || u.selectedIndex === null;
        const hasRevealed = typeof u.revealed === 'boolean';
        const data: any = {};
        if (hasSel) data.selectedIndex = u.selectedIndex ?? null;
        if (hasRevealed) data.revealed = u.revealed;
        return prisma.quizProgress.upsert({
          where: { userId_questionId: { userId, questionId: u.questionId } },
          create: {
            userId,
            subtopicId,
            questionId: u.questionId,
            ...data,
          },
          update: data,
        });
      });
    if (tasks.length) await Promise.all(tasks);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}


