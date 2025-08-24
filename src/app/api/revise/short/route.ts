import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isAuthed = isSessionWithUser(session);
    const userId = isAuthed ? session.user.id : '';
    const { searchParams } = new URL(req.url);
    const lectureId = String(searchParams.get('lectureId') || '').trim();
    const subtopicId = String(searchParams.get('subtopicId') || '').trim();
    if (!lectureId || !subtopicId) {
      return NextResponse.json({ error: 'lectureId and subtopicId are required' }, { status: 400 });
    }
    // 1) Load global saved prompt (idempotent per lecture+subtopic)
    let promptRow: any = null;
    try {
      promptRow = await prisma.shortAnswerPrompt.findUnique({
        where: { lectureId_subtopicId: { lectureId, subtopicId } },
      });
    } catch {}

    // 2) Load most recent user-specific saved answer/score from TutorMessage (source of truth for answers)
    let userSaved: { answer?: string; score?: number; feedback?: string } | undefined = undefined;
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
            feedback: typeof refs.feedback === 'string' ? refs.feedback : undefined,
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
            feedback: typeof refs.feedback === 'string' ? refs.feedback : undefined,
          });
        }
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
    const isAuthed = isSessionWithUser(session);
    const userId = isAuthed ? session.user.id : '';
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      subtopicId?: string;
      prompt?: string;
      modelAnswer?: string;
      answer?: string;
      score?: number;
      feedback?: string;
    };
    const lectureId = String(body?.lectureId || '').trim();
    const subtopicId = String(body?.subtopicId || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const modelAnswer = String(body?.modelAnswer || '').trim();
    const answer = String(body?.answer || '').trim();
    const scoreRaw = body?.score;
    const score = typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? Math.max(0, Math.min(10, Math.trunc(scoreRaw))) : undefined;
    const feedback = String(body?.feedback || '').trim();
    if (!lectureId || !subtopicId || !prompt) {
      return NextResponse.json({ error: 'lectureId, subtopicId, and prompt are required' }, { status: 400 });
    }
    // Persist or upsert the global prompt so multiple clients do not generate duplicates.
    try {
      if (lectureId && subtopicId && prompt) {
        await prisma.shortAnswerPrompt.upsert({
          where: { lectureId_subtopicId: { lectureId, subtopicId } },
          update: { prompt, modelAnswer },
          create: { lectureId, subtopicId, prompt, modelAnswer: modelAnswer || '' },
        });
      }
    } catch {}

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
        let target: { id: string } | null = null;
        for (const r of recent) {
          const refs = (r.refs as any) || {};
          if (refs && refs.subtopicId === subtopicId && r.text === prompt) {
            target = { id: r.id };
            break;
          }
        }
        if (!target) {
          for (const r of recent) {
            const refs = (r.refs as any) || {};
            if (refs && refs.subtopicId === subtopicId) {
              target = { id: r.id };
              break;
            }
          }
        }
        const payload = {
          subtopicId,
          modelAnswer,
          answer,
          score,
          feedback: feedback || undefined,
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
    // If a score is provided, persist into lifetime short-answer grades table (idempotent per user+prompt)
    try {
      if (typeof score === 'number' && isAuthed) {
        const promptHash = crypto.createHash('sha256').update([lectureId, prompt].join('|')).digest('hex');
        try {
          await prisma.$executeRaw`INSERT INTO "ShortAnswerGrade" ("userId", "lectureId", "promptHash", "score") VALUES (${userId}, ${lectureId || null}, ${promptHash}, ${score}) ON CONFLICT ("userId", "promptHash") DO UPDATE SET "score" = EXCLUDED."score"`;
        } catch (e: any) {
          try {
            await prisma.$executeRaw`INSERT INTO "ShortAnswerGrade" ("userId", "lectureId", "promptHash", "score") VALUES (${userId}, ${null}, ${promptHash}, ${score}) ON CONFLICT ("userId", "promptHash") DO UPDATE SET "score" = EXCLUDED."score"`;
          } catch (e2: any) {
            console.error('ShortAnswerGrade insert failed (short route)', { userId, lectureId, err: String(e2?.message || e2) });
          }
        }
      }
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}



