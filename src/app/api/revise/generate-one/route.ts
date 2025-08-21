import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { normalizeModelMarkdown, stripDependentPhrasing } from '@/lib/text/normalize-markdown';
import crypto from 'crypto';

// Coalesce concurrent generation requests with identical lesson text
const inflight = new Map<string, Promise<{ prompt: string; modelAnswer: string }>>();

export async function POST(req: NextRequest) {
  try {
    // Allow anonymous generation for public demo when lesson content is provided.
    // If not authenticated, require sufficient lesson content to proceed.
    const body = (await req.json().catch(() => ({}))) as {
      lessonMd?: string;
      subtopicTitle?: string;
    };
    const lessonMd = String(body?.lessonMd || '').trim();
    const subtopicTitle = String(body?.subtopicTitle || '').trim();

    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session) && (!lessonMd || lessonMd.length < 50)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!lessonMd || lessonMd.length < 50) {
      return NextResponse.json({ error: 'Lesson content too short' }, { status: 400 });
    }

    const { generateJSON } = await import('@/lib/ai');
    const prompt = [
      'You are writing ONE short-answer question to assess conceptual understanding using ONLY the LESSON below.',
      'Requirements:',
      '- The question must be self-contained and answerable strictly from the LESSON.',
      '- Make it broad and high-level to check understanding of the subtopic overall, not a niche detail.',
      '- Avoid asking for rote memorization of minor facts, numbers, or edge cases.',
      '- Do not require any outside knowledge not present in the LESSON.',
      "- Do NOT include phrases like 'Based on the lesson/content', 'According to the text', or 'From the passage'. Write the question as a standalone item without referencing the lesson/content.",
      'Return ONLY JSON with exactly this shape:',
      '{ "prompt": string, "modelAnswer": string }',
      'Model answer should be concise (2–6 sentences) and aligned with the LESSON.',
      '---',
      subtopicTitle ? `SUBTOPIC: ${subtopicTitle}` : '',
      'LESSON:',
      lessonMd.slice(0, 6000),
      '---',
    ]
      .filter(Boolean)
      .join('\n');

    const key = crypto.createHash('sha256').update(lessonMd.slice(0, 6000)).digest('hex');
    const run = async (): Promise<{ prompt: string; modelAnswer: string }> => {
      let out: any = {};
      try {
        const model = process.env.AI_QUALITY_MODEL || 'gpt-5-mini';
        out = await generateJSON(prompt, model, undefined);
      } catch {}
      const qPromptRaw = String(out?.prompt || '').trim();
      const modelAnswerRaw = String(out?.modelAnswer || '').trim();
      const qPrompt = stripDependentPhrasing(normalizeModelMarkdown(qPromptRaw));
      const modelAnswer = stripDependentPhrasing(normalizeModelMarkdown(modelAnswerRaw));
      return { prompt: qPrompt || '', modelAnswer: modelAnswer || '' };
    };
    let p = inflight.get(key);
    if (!p) {
      p = run().finally(() => {
        // Ensure cleanup even on errors
        setTimeout(() => inflight.delete(key), 0);
      });
      inflight.set(key, p);
    }
    const result = await p;
    if (!result.prompt) {
      return NextResponse.json({ prompt: '', modelAnswer: '' });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


