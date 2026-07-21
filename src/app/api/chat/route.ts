import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
import {
  generateText,
  PRIMARY_MODEL,
  REASONING_EFFORT,
  streamTextChunks,
} from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/prisma';
import { recordTokenUsage } from '@/lib/token-logger';
import { buildTutorPrompt, buildTutorSystemPrompt } from '@/lib/ai-prompts';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const body = (await req.json().catch(() => ({}))) as {
      userQuestion?: string;
      documentContent?: string;
      demoMode?: boolean;
      lectureId?: string;
      subtopicId?: string;
    };
    const userQuestion = String(body.userQuestion || '').trim();
    let documentContent = String(body.documentContent || '')
      .trim()
      .slice(0, 24_000);
    const demoMode = Boolean(body.demoMode);
    const lectureId = String(body.lectureId || '')
      .trim()
      .slice(0, 80);
    const subtopicId = String(body.subtopicId || '')
      .trim()
      .slice(0, 80);

    if (!userId && !demoMode) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(
      rateLimitKey(req, 'tutor', userId),
      userId ? 60 : 12,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many tutor requests. Please wait and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    if (!userQuestion) {
      return NextResponse.json(
        { error: 'A question is required.' },
        { status: 400 }
      );
    }
    if (!demoMode && !lectureId) {
      return NextResponse.json(
        { error: 'A lesson is required for tutor questions.' },
        { status: 400 }
      );
    }
    if (demoMode && documentContent.length < 50) {
      return NextResponse.json(
        { error: 'Lesson content is required for the demo tutor.' },
        { status: 400 }
      );
    }
    if (userQuestion.length > 2_000) {
      return NextResponse.json(
        { error: 'Keep tutor questions under 2,000 characters.' },
        { status: 413 }
      );
    }

    const t0 = Date.now();
    const METRICS =
      process.env.AI_METRICS === '1' || process.env.LOG_AI === '1';
    const chosenModel = PRIMARY_MODEL;

    // If query param stream=1, return Server-Sent Events style text/event-stream
    const url = new URL(req.url);
    const doStream = url.searchParams.get('stream') === '1';
    let canPersist = false;
    if (userId && lectureId && !demoMode) {
      const ownedLecture = await prisma.lecture.findFirst({
        where: { id: lectureId, userId },
        select: {
          id: true,
          title: true,
          originalContent: true,
          subtopics: {
            ...(subtopicId ? { where: { id: subtopicId } } : {}),
            orderBy: { order: 'asc' },
            select: { title: true, overview: true, explanation: true },
          },
        },
      });
      if (!ownedLecture) {
        return NextResponse.json(
          { error: 'Lecture not found.' },
          { status: 404 }
        );
      }
      if (subtopicId && ownedLecture.subtopics.length === 0) {
        return NextResponse.json(
          { error: 'Section not found.' },
          { status: 404 }
        );
      }
      const sourceParts = [`# ${ownedLecture.title}`];
      const sectionBodyParts: string[] = [];
      for (const section of ownedLecture.subtopics) {
        if (section.title) sourceParts.push(`## ${section.title}`);
        if (section.overview?.trim()) {
          sourceParts.push(section.overview.trim());
          sectionBodyParts.push(section.overview.trim());
        }
        if (section.explanation?.trim()) {
          sourceParts.push(section.explanation.trim());
          sectionBodyParts.push(section.explanation.trim());
        }
      }
      const structuredSectionSource = sourceParts.join('\n\n').trim();
      const sectionBody = sectionBodyParts.join('\n\n').trim();
      const originalSource = ownedLecture.originalContent.trim();
      const hasCompleteSectionContext =
        ownedLecture.subtopics.length > 0 &&
        ownedLecture.subtopics.every((section) =>
          Boolean(section.explanation?.trim())
        ) &&
        sectionBody.length >= 120;

      // A generated section can exist before its explanation is complete. In
      // that state the heading alone is not useful grounding, so tutor from the
      // original lesson rather than presenting a title-only source to the model.
      documentContent = (
        hasCompleteSectionContext
          ? structuredSectionSource
          : originalSource || structuredSectionSource
      ).slice(0, 24_000);
      canPersist = true;
    }

    const systemMsg = buildTutorSystemPrompt();
    const userMsg = buildTutorPrompt(
      userQuestion,
      documentContent,
      Boolean(demoMode)
    );

    // Persist user message before generating
    if (canPersist) {
      try {
        await prisma.tutorMessage.create({
          data: {
            userId: userId!,
            lectureId: String(lectureId),
            role: 'user',
            text: userQuestion,
            refs: subtopicId ? { subtopicId } : undefined,
          },
        });
      } catch {}
    }

    if (doStream) {
      const encoder = new TextEncoder();
      let full = '';
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const usedModel = chosenModel;
            const gen = streamTextChunks(userMsg, chosenModel, systemMsg);
            for await (const chunk of gen) {
              full += chunk;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', delta: chunk })}\n\n`
                )
              );
            }
            // Normalize full transcript before persisting
            try {
              const { normalizeModelMarkdown } = await import(
                '@/lib/text/normalize-markdown'
              );
              full = normalizeModelMarkdown(full);
            } catch {}
            const ms = Date.now() - t0;
            const used = usedModel;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'done', debug: { model: used, reasoningEffort: REASONING_EFFORT, ms } })}\n\n`
              )
            );
            controller.close();
            // Best-effort token logging (approx estimate for streamed path)
            try {
              const inChars =
                String(userMsg || '').length + String(systemMsg || '').length;
              const outChars = String(full || '').length;
              const inputTokens = Math.ceil(inChars / 4);
              const outputTokens = Math.ceil(outChars / 4);
              await recordTokenUsage({
                userId: userId,
                route: '/api/chat',
                model: used,
                tokensInput: inputTokens,
                tokensOutput: outputTokens,
                totalTokens: inputTokens + outputTokens,
              });
            } catch {}
            // Persist assistant reply
            if (canPersist) {
              try {
                await prisma.tutorMessage.create({
                  data: {
                    userId: userId!,
                    lectureId: String(lectureId),
                    role: 'ai',
                    text: full,
                    refs: subtopicId ? { subtopicId } : undefined,
                  },
                });
              } catch {}
            }
            // Demo mode should be fully ephemeral; skip streak bumps when demoMode is true
            if (userId && !demoMode) {
              try {
                await bumpDailyStreak(userId);
                try {
                  revalidateTag(`user-stats:${userId}`);
                } catch {}
              } catch {}
            }
            if (METRICS) {
              try {
                console.log(
                  'CHAT_METRICS',
                  JSON.stringify({ ok: true, stream: true, ms, model: used })
                );
              } catch {}
            }
          } catch (e: any) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', error: e?.message || 'stream failed' })}\n\n`
              )
            );
            controller.close();
            if (METRICS) {
              try {
                console.log(
                  'CHAT_METRICS',
                  JSON.stringify({
                    ok: false,
                    stream: true,
                    ms: Date.now() - t0,
                    model: String(chosenModel || 'default'),
                    error: String(e?.message || 'stream failed'),
                  })
                );
              } catch {}
            }
          }
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          'X-AI-Model': String(chosenModel || 'default'),
          'X-AI-Reasoning-Effort': REASONING_EFFORT,
        },
      });
    }

    // Fallback: non-streaming JSON
    const aiTextResponseRaw = await generateText(
      userMsg,
      chosenModel,
      systemMsg
    );
    let aiTextResponse = aiTextResponseRaw;
    try {
      const { normalizeModelMarkdown } = await import(
        '@/lib/text/normalize-markdown'
      );
      aiTextResponse = normalizeModelMarkdown(aiTextResponseRaw);
    } catch {}
    if (canPersist) {
      try {
        await prisma.tutorMessage.create({
          data: {
            userId: userId!,
            lectureId: String(lectureId),
            role: 'ai',
            text: aiTextResponse,
            refs: subtopicId ? { subtopicId } : undefined,
          },
        });
      } catch {}
    }
    const ms = Date.now() - t0;
    const used = chosenModel;
    // Demo mode should be fully ephemeral; skip streak bumps when demoMode is true
    if (userId && !demoMode) {
      await bumpDailyStreak(userId);
      try {
        revalidateTag(`user-stats:${userId}`);
      } catch {}
    }
    if (METRICS) {
      try {
        console.log(
          'CHAT_METRICS',
          JSON.stringify({ ok: true, stream: false, ms, model: used })
        );
      } catch {}
    }
    return new NextResponse(
      JSON.stringify({
        response: aiTextResponse,
        debug: { model: used, reasoningEffort: REASONING_EFFORT, ms },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-AI-Model': String(used),
          'X-AI-Reasoning-Effort': REASONING_EFFORT,
          'X-Response-Time': String(ms),
        },
      }
    );
  } catch (error: any) {
    console.error('Error in chat API:', error);
    try {
      if (process.env.AI_METRICS === '1' || process.env.LOG_AI === '1') {
        console.log(
          'CHAT_METRICS',
          JSON.stringify({
            ok: false,
            stream: false,
            ms: 0,
            model: 'unknown',
            error: String(error?.message || 'error'),
          })
        );
      }
    } catch {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
