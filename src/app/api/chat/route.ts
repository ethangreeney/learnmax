import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
import { generateText, streamTextChunks } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const { userQuestion, documentContent, model, demoMode } =
      (await req.json()) as {
        userQuestion: string;
        documentContent: string;
        model?: string;
        demoMode?: boolean;
      };

    if (!userQuestion) {
      return NextResponse.json(
        { error: 'A question is required.' },
        { status: 400 }
      );
    }

    const systemPrompt = `
You are an expert academic tutor. Ground your answers first in the CURRENT SUBTOPIC content provided below, and otherwise in your general knowledge.

STYLE AND BEHAVIOR
- Be clear, direct, and encouraging.
- Use the provided subtopic content as your primary reference when relevant.
- If information extends beyond the provided content, answer confidently without calling out that the content may be incomplete.
- Avoid hedging or meta commentary. Do not say phrases like: "the input document only says...", "I'm not sure", or "based on general knowledge". Just answer succinctly and professionally.

---
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
    // Prefer explicit client selection; otherwise allow overriding via env for tutor only.
    const tutorDefaultModel =
      process.env.AI_TUTOR_MODEL?.trim() ||
      (process.env.NODE_ENV === 'production' ? 'gpt-5' : undefined);
    const chosenModel = (model && model.trim()) || tutorDefaultModel;

    // If query param stream=1, return Server-Sent Events style text/event-stream
    const url = new URL(req.url);
    const doStream = url.searchParams.get('stream') === '1';

    if (doStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of streamTextChunks(
              systemPrompt,
              chosenModel
            )) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'chunk', delta: chunk })}\n\n`
                )
              );
            }
            const ms = Date.now() - t0;
            const used = chosenModel || process.env.GEMINI_MODEL || 'default';
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'done', debug: { model: used, ms } })}\n\n`
              )
            );
            controller.close();
            // Demo mode should be fully ephemeral; skip streak bumps when demoMode is true
            if (userId && !demoMode) {
              try {
                await bumpDailyStreak(userId);
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
                    model: chosenModel || 'default',
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
    const aiTextResponse = await generateText(systemPrompt, chosenModel);
    const ms = Date.now() - t0;
    const used = chosenModel || process.env.GEMINI_MODEL || 'default';
    // Demo mode should be fully ephemeral; skip streak bumps when demoMode is true
    if (userId && !demoMode) {
      await bumpDailyStreak(userId);
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
