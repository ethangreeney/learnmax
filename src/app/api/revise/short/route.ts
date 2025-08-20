import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const lectureId = String(searchParams.get('lectureId') || '').trim();
    const subtopicId = String(searchParams.get('subtopicId') || '').trim();
    if (!lectureId || !subtopicId) {
      return NextResponse.json({ error: 'lectureId and subtopicId are required' }, { status: 400 });
    }

    const rows = await prisma.tutorMessage.findMany({
      where: { userId, lectureId, role: 'short-q' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    for (const r of rows) {
      const refs = (r.refs as any) || {};
      if (refs && refs.subtopicId === subtopicId) {
        return NextResponse.json({
          prompt: r.text,
          modelAnswer: refs.modelAnswer || '',
          answer: refs.answer || '',
          score: typeof refs.score === 'number' ? refs.score : undefined,
        });
      }
    }
    return NextResponse.json({ prompt: '', modelAnswer: '' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      subtopicId?: string;
      prompt?: string;
      modelAnswer?: string;
      answer?: string;
      score?: number;
    };
    const lectureId = String(body?.lectureId || '').trim();
    const subtopicId = String(body?.subtopicId || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const modelAnswer = String(body?.modelAnswer || '').trim();
    const answer = String(body?.answer || '').trim();
    const scoreRaw = body?.score;
    const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? Math.max(0, Math.min(10, Math.trunc(scoreRaw))) : undefined;
    if (!lectureId || !subtopicId || !prompt) {
      return NextResponse.json({ error: 'lectureId, subtopicId, and prompt are required' }, { status: 400 });
    }

    await prisma.tutorMessage.create({
      data: {
        userId,
        lectureId,
        role: 'short-q',
        text: prompt,
        refs: {
          subtopicId,
          modelAnswer,
          answer,
          score,
        } as any,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


