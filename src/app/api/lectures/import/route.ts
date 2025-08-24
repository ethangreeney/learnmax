import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import prisma from '@/lib/prisma';
import { rateLimit } from '@/lib/shared/ratelimit';
 

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }
    const rl = rateLimit(`import:${session.user.id}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });

    // Load source lecture minimally then with relations
    const source = await prisma.lecture.findFirst({
      where: { shareToken: token, shareRevokedAt: null },
      select: { id: true, title: true, originalContent: true, userId: true },
    });
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const relations = await prisma.subtopic.findMany({
      where: { lectureId: source.id },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        title: true,
        importance: true,
        difficulty: true,
        overview: true,
        explanation: true,
        questions: {
          select: {
            prompt: true,
            options: true,
            answerIndex: true,
            explanation: true,
          },
        },
      },
    });

    // Create new lecture owned by importer; reset counters/state by omission
    const userId = session.user.id;
    const created = await prisma.lecture.create({
      data: {
        title: source.title,
        originalContent: source.originalContent,
        userId,
        sourceLectureId: source.id,
        lastOpenedAt: new Date(),
      },
      select: { id: true },
    });

    // Insert subtopics
    await prisma.subtopic.createMany({
      data: relations.map((s) => ({
        lectureId: created.id,
        order: s.order,
        title: s.title,
        importance: s.importance,
        difficulty: s.difficulty,
        overview: s.overview || '',
        explanation: s.explanation || null,
      })),
    });

    const newSubtopics = await prisma.subtopic.findMany({
      where: { lectureId: created.id },
      orderBy: { order: 'asc' },
      select: { id: true },
    });
    // Map by order
    const idByOrder = newSubtopics.map((s) => s.id);
    const quizRows: Array<{ prompt: string; options: any; answerIndex: number; explanation: string; subtopicId: string }> = [];
    for (let i = 0; i < relations.length; i++) {
      const src = relations[i];
      const dstId = idByOrder[i];
      if (!dstId) continue;
      for (const q of src.questions || []) {
        quizRows.push({
          prompt: q.prompt,
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
          subtopicId: dstId,
        });
      }
    }
    if (quizRows.length) {
      await prisma.quizQuestion.createMany({ data: quizRows });
    }

    try {
      await prisma.$executeRaw`UPDATE "User" SET "lifetimeLecturesCreated" = "lifetimeLecturesCreated" + 1 WHERE "id" = ${userId}`;
    } catch {}

    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || '';
      const origin = base ? (base.startsWith('http') ? base : `https://${base}`) : '';
      if (origin) {
        void fetch(origin + '/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'lecture.import.success', sourceLectureId: source.id, newLectureId: created.id }),
        });
      }
    } catch {}

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e: any) {
    try {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lecture.import.failure', error: String(e?.message || e) }),
      });
    } catch {}
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


