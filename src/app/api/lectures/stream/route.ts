import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { generateJSON } from '@/lib/ai';

function sanitizeDbText(s: string): string {
  return (s || '').replace(/\u0000/g, '');
}

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401 });
    }
    const url = new URL(req.url);
    const lectureId = String(url.searchParams.get('lectureId') || '').trim();
    const preferredModel = String(url.searchParams.get('model') || '').trim() || undefined;
    if (!lectureId) {
      return new Response(JSON.stringify({ error: 'lectureId required' }), { status: 400 });
    }
    const userId = session.user.id;
    const lecture = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true, title: true, originalContent: true },
    });
    if (!lecture) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const existing = await prisma.subtopic.findMany({ where: { lectureId }, orderBy: { order: 'asc' } });
          let offset = existing.length;
          // Emit already-present subtopics immediately
          for (const s of existing) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'subtopic',
                  subtopic: {
                    id: s.id,
                    order: s.order,
                    title: s.title,
                    importance: s.importance,
                    difficulty: s.difficulty,
                    overview: s.overview,
                    explanation: s.explanation || '',
                  },
                })}\n\n`,
              ),
            );
          }

          // Compute breakdown and insert any missing subtopics progressively
          const text = lecture.originalContent || '';
          if (!text) throw new Error('Lecture has no content');

          const charLen = text.length;
          const breakdownPrompt = `
You are an expert instructional designer. Create an exhaustive, sequential breakdown of the entire document below.

Goals:
- Cover ALL major sections and distinct concepts. Do not merge unrelated topics.
- Preserve the original document order from start to finish.
- Be concise but complete: each subtopic should map to a coherent portion of the document.
 - Generate between 8 and 15 subtopics in total. Aim for about 12 on average. Never exceed 15.

Return ONLY a single JSON object with exactly these keys:
{
  "topic": "string",
  "subtopics": [
    { "title": "string", "importance": "high" | "medium" | "low", "difficulty": 1 | 2 | 3, "overview": "string" }
  ]
}

Document:
---
${text}
          `;
          const bdRaw = await generateJSON(breakdownPrompt, preferredModel);
          const DEFAULT_TITLE = 'Generating lesson... Please Wait';
          const topic = typeof bdRaw?.topic === 'string' && bdRaw.topic.trim() ? bdRaw.topic.trim() : DEFAULT_TITLE;
          const subtopics: Array<{ title: string; importance: string; difficulty: number; overview?: string }>
            = Array.isArray(bdRaw?.subtopics) ? bdRaw.subtopics : [];

          // Update title if different
          if (topic && topic !== lecture.title) {
            await prisma.lecture.update({ where: { id: lectureId }, data: { title: topic } });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'title', title: topic })}\n\n`));
          }

          // Select the most important subtopics instead of the first ones
          const cap = 15;
          const scored = subtopics.map((s, idx) => ({
            idx,
            s,
            rank: (() => {
              const imp = String(s?.importance || 'medium').toLowerCase();
              return imp === 'high' ? 3 : imp === 'low' ? 1 : 2;
            })(),
          }));
          // Pick top by importance rank, then keep original document order among the selected for readability
          const top = scored
            .sort((a, b) => b.rank - a.rank || a.idx - b.idx)
            .slice(0, cap)
            .sort((a, b) => a.idx - b.idx);

          for (let i = offset; i < top.length; i++) {
            const s = top[i].s;
            const created = await prisma.subtopic.create({
              data: {
                order: i,
                title: String(s?.title || `Section ${i + 1}`),
                importance: String(s?.importance || 'medium'),
                difficulty: Number(s?.difficulty || 2),
                overview: sanitizeDbText(String(s?.overview || '')),
                explanation: null,
                lectureId,
              },
            });
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'subtopic',
                  subtopic: {
                    id: created.id,
                    order: created.order,
                    title: created.title,
                    importance: created.importance,
                    difficulty: created.difficulty,
                    overview: created.overview,
                    explanation: '',
                  },
                })}\n\n`,
              ),
            );
            // Small delay for UI pacing
            await new Promise((r) => setTimeout(r, 50));
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e?.message || 'stream failed' })}\n\n`));
          controller.close();
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
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'failed' }), { status: 500 });
  }
}


