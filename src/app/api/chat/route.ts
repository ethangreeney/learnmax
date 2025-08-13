import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
import { generateText, streamTextChunks } from '@/lib/ai';
import { getSelectedModelFromRequest } from '@/lib/ai-choice';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/prisma';
import { recordTokenUsage } from '@/lib/token-logger';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const { userQuestion, documentContent, model, demoMode, lectureId } =
      (await req.json()) as {
        userQuestion: string;
        documentContent: string;
        model?: string;
        demoMode?: boolean;
        lectureId?: string;
      };

    if (!userQuestion) {
      return NextResponse.json(
        { error: 'A question is required.' },
        { status: 400 }
      );
    }

    const systemMsg = `You are an expert academic tutor. Be clear, direct, encouraging, and do not include meta commentary or disclaimers.`;
    const userMsg = `
CURRENT SUBTOPIC CONTENT
${
  documentContent && documentContent.trim().length > 0
    ? documentContent
    : demoMode
      ? 'Demo note: Proceed using general knowledge without commenting on missing content.'
      : 'No lesson content provided. Proceed with general knowledge without disclaimers.'
}
---
USER QUESTION
${userQuestion}
`;

    const t0 = Date.now();
    const METRICS =
      process.env.AI_METRICS === '1' || process.env.LOG_AI === '1';
    // Global selection: cookie overrides body/env
    const selected = 'gemini-2.5-flash-lite';
    const tutorDefaultModel =
      process.env.AI_TUTOR_MODEL?.trim() ||
      process.env.AI_FAST_MODEL?.trim() ||
      (process.env.NODE_ENV === 'production' ? 'gpt-5' : undefined);
    const chosenModel = 'gemini-2.5-flash-lite';

    // If query param stream=1, return Server-Sent Events style text/event-stream
    const url = new URL(req.url);
    const doStream = url.searchParams.get('stream') === '1';
    const canPersist = Boolean(userId && lectureId && !demoMode);

    // Persist user message before generating
    if (canPersist) {
      try {
        await prisma.tutorMessage.create({
          data: {
            userId: userId!,
            lectureId: String(lectureId),
            role: 'user',
            text: userQuestion,
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
            let usedModel: string = String(chosenModel || process.env.GEMINI_MODEL || 'default');
            const gen = streamTextChunks(
              userMsg,
              chosenModel,
              systemMsg
            );
            // Attach model if the generator exposes it
            usedModel = (gen as any)?.usedModel || usedModel;
            for await (const chunk of gen) {
              full += chunk;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', delta: chunk })}\n\n`
                )
              );
            }
            const ms = Date.now() - t0;
            const used = (gen as any)?.usedModel || usedModel;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'done', debug: { model: used, ms } })}\n\n`
              )
            );
            controller.close();
            // Best-effort token logging (approx estimate for streamed path)
            try {
              const inChars = String(userMsg || '').length + String(systemMsg || '').length;
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
                  },
                });
              } catch {}
            }
            // Demo mode should be fully ephemeral; skip streak bumps when demoMode is true
            if (userId && !demoMode) {
              try {
                await bumpDailyStreak(userId);
                try { revalidateTag(`user-stats:${userId}`); } catch {}
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
        },
      });
    }

    // Fallback: non-streaming JSON
    const aiTextResponse = await generateText(userMsg, chosenModel, systemMsg);
    if (canPersist) {
      try {
        await prisma.tutorMessage.create({
          data: {
            userId: userId!,
            lectureId: String(lectureId),
            role: 'ai',
            text: aiTextResponse,
          },
        });
      } catch {}
    }
    const ms = Date.now() - t0;
    const used = chosenModel || process.env.GEMINI_MODEL || 'default';
    // Demo mode should be fully ephemeral; skip streak bumps when demoMode is true
    if (userId && !demoMode) {
      await bumpDailyStreak(userId);
      try { revalidateTag(`user-stats:${userId}`); } catch {}
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
      JSON.stringify({ response: aiTextResponse, debug: { model: used, ms } }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-AI-Model': String(used),
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
