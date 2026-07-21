import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isAuthed = isSessionWithUser(session);
    const userId = isAuthed ? session.user.id : '';
    const { searchParams } = new URL(req.url);
    const lectureId = String(searchParams.get('lectureId') || '').trim();
    const subtopicId = String(searchParams.get('subtopicId') || '').trim();
    if (!isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!lectureId || !subtopicId) {
      return NextResponse.json(
        { error: 'lectureId and subtopicId are required' },
        { status: 400 }
      );
    }
    const ownedSubtopic = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lectureId, lecture: { userId } },
      select: { id: true },
    });
    if (!ownedSubtopic) {
      return NextResponse.json(
        { error: 'Subtopic not found.' },
        { status: 404 }
      );
    }
    // 1) Load global saved prompt (idempotent per lecture+subtopic)
    let promptRow: any = null;
    try {
      promptRow = await prisma.shortAnswerPrompt.findUnique({
        where: { lectureId_subtopicId: { lectureId, subtopicId } },
      });
    } catch {}

    // 2) Load most recent user-specific saved answer/score from TutorMessage (source of truth for answers)
    let userSaved:
      | { answer?: string; score?: number; feedback?: string }
      | undefined = undefined;
    if (isAuthed) {
      const rows = await prisma.tutorMessage.findMany({
        where: { userId, lectureId, role: 'short-q' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      for (const r of rows) {
        const refs = (r.refs as any) || {};
        if (refs && refs.subtopicId === subtopicId) {
          userSaved = {
            answer: typeof refs.answer === 'string' ? refs.answer : undefined,
            score: typeof refs.score === 'number' ? refs.score : undefined,
            feedback:
              typeof refs.feedback === 'string' ? refs.feedback : undefined,
          };
          break;
        }
      }
    }

    if (promptRow) {
      return NextResponse.json({
        prompt: promptRow.prompt,
        modelAnswer: promptRow.modelAnswer || '',
        answer: userSaved?.answer || '',
        score: userSaved?.score,
        feedback: userSaved?.feedback,
      });
    }
    // Fallback for legacy saves that only used TutorMessage
    if (isAuthed) {
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
            feedback:
              typeof refs.feedback === 'string' ? refs.feedback : undefined,
          });
        }
      }
    }
    return NextResponse.json({ prompt: '', modelAnswer: '' });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isAuthed = isSessionWithUser(session);
    const userId = isAuthed ? session.user.id : '';
    if (!isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const limit = rateLimit(
      rateLimitKey(req, 'revision-save', userId),
      100,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many revision updates. Please wait and try again.' },
        { status: 429 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      subtopicId?: string;
      prompt?: string;
      modelAnswer?: string;
      answer?: string;
      score?: number;
      feedback?: string;
    };
    const lectureId = String(body?.lectureId || '')
      .trim()
      .slice(0, 80);
    const subtopicId = String(body?.subtopicId || '')
      .trim()
      .slice(0, 80);
    const prompt = String(body?.prompt || '')
      .trim()
      .slice(0, 2_000);
    const modelAnswer = String(body?.modelAnswer || '')
      .trim()
      .slice(0, 6_000);
    const answer = String(body?.answer || '')
      .trim()
      .slice(0, 6_000);
    const scoreRaw = body?.score;
    const requestedScore =
      typeof scoreRaw === 'number' && Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(10, Math.trunc(scoreRaw)))
        : undefined;
    const feedback = String(body?.feedback || '')
      .trim()
      .slice(0, 3_000);
    if (!lectureId || !subtopicId || !prompt) {
      return NextResponse.json(
        { error: 'lectureId, subtopicId, and prompt are required' },
        { status: 400 }
      );
    }
    const ownedSubtopic = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lectureId, lecture: { userId } },
      select: { id: true },
    });
    if (!ownedSubtopic) {
      return NextResponse.json(
        { error: 'Subtopic not found.' },
        { status: 404 }
      );
    }
    let verifiedScore: number | undefined;
    if (typeof requestedScore === 'number') {
      const promptHash = crypto
        .createHash('sha256')
        .update([lectureId, prompt].join('|'))
        .digest('hex');
      const serverGrade = await prisma.shortAnswerGrade.findUnique({
        where: { userId_promptHash: { userId, promptHash } },
        select: { score: true },
      });
      verifiedScore = serverGrade?.score;
    }
    // Canonical prompts are created by the server-side generation route from
    // owned lesson content. This endpoint may only save answers against that
    // immutable question.
    const canonicalPrompt = await prisma.shortAnswerPrompt.findUnique({
      where: { lectureId_subtopicId: { lectureId, subtopicId } },
      select: { prompt: true },
    });
    if (!canonicalPrompt || canonicalPrompt.prompt !== prompt) {
      return NextResponse.json(
        {
          error:
            'This mastery question changed. Refresh the lesson and try again.',
        },
        { status: 409 }
      );
    }

    // Persist user-specific answer/score for restore in TutorMessage.
    // Idempotent: update existing record for this (user, lecture, subtopic) when present.
    if (isAuthed) {
      try {
        // Look back over recent short-q messages for this lecture and user
        const recent = await prisma.tutorMessage.findMany({
          where: { userId, lectureId, role: 'short-q' },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        let target: { id: string; refs: Record<string, unknown> } | null = null;
        for (const r of recent) {
          const refs = (r.refs as any) || {};
          if (refs && refs.subtopicId === subtopicId && r.text === prompt) {
            target = { id: r.id, refs };
            break;
          }
        }
        if (!target) {
          for (const r of recent) {
            const refs = (r.refs as any) || {};
            if (refs && refs.subtopicId === subtopicId) {
              target = { id: r.id, refs };
              break;
            }
          }
        }
        const existingRefs = target?.refs || {};
        const sameSavedAnswer =
          typeof existingRefs.answer === 'string' &&
          existingRefs.answer === answer;
        const payload = {
          subtopicId,
          modelAnswer:
            modelAnswer ||
            (sameSavedAnswer && typeof existingRefs.modelAnswer === 'string'
              ? existingRefs.modelAnswer
              : ''),
          answer,
          score:
            typeof requestedScore === 'number'
              ? verifiedScore
              : sameSavedAnswer && typeof existingRefs.score === 'number'
                ? existingRefs.score
                : undefined,
          feedback:
            feedback ||
            (sameSavedAnswer && typeof existingRefs.feedback === 'string'
              ? existingRefs.feedback
              : undefined),
        } as any;
        if (target) {
          await prisma.tutorMessage.update({
            where: { id: target.id },
            data: {
              text: prompt,
              refs: payload,
            },
          });
        } else {
          await prisma.tutorMessage.create({
            data: {
              userId,
              lectureId,
              role: 'short-q',
              text: prompt,
              refs: payload,
            },
          });
        }
      } catch {}
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
