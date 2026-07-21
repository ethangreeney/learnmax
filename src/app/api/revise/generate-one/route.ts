import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import {
  normalizeModelMarkdown,
  stripDependentPhrasing,
} from '@/lib/text/normalize-markdown';
import crypto from 'crypto';
import { SOURCE_HANDLING_RULES, wrapSource } from '@/lib/ai-prompts';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';
import prisma from '@/lib/prisma';

// Coalesce concurrent generation requests with identical lesson text
const inflight = new Map<
  string,
  Promise<{ prompt: string; modelAnswer: string }>
>();

export async function POST(req: NextRequest) {
  try {
    // Allow anonymous generation for public demo when lesson content is provided.
    // If not authenticated, require sufficient lesson content to proceed.
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      subtopicId?: string;
      lessonMd?: string;
      subtopicTitle?: string;
    };
    const lectureId = String(body?.lectureId || '')
      .trim()
      .slice(0, 80);
    const subtopicId = String(body?.subtopicId || '')
      .trim()
      .slice(0, 80);
    const providedLessonMd = String(body?.lessonMd || '')
      .trim()
      .slice(0, 8_000);
    let subtopicTitle = String(body?.subtopicTitle || '')
      .trim()
      .slice(0, 200);

    const session = await getServerSession(authOptions);
    const isAuthed = isSessionWithUser(session);
    const userId = isAuthed ? session.user.id : null;
    const limit = rateLimit(
      rateLimitKey(req, 'revision-question', userId),
      isAuthed ? 30 : 8,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many revision requests. Please wait and try again.' },
        { status: 429 }
      );
    }
    if (lectureId && !isAuthed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Real lessons are always read from the database. Browser-provided lesson
    // text is reserved for the public demo and is never persisted.
    let lessonMd = '';
    if (lectureId) {
      if (!subtopicId) {
        return NextResponse.json(
          { error: 'subtopicId required' },
          { status: 400 }
        );
      }
      const subtopic = await prisma.subtopic.findFirst({
        where: { id: subtopicId, lectureId, lecture: { userId: userId || '' } },
        select: {
          title: true,
          overview: true,
          explanation: true,
          lecture: { select: { title: true, originalContent: true } },
        },
      });
      if (!subtopic) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const existingPrompt = await prisma.shortAnswerPrompt.findUnique({
        where: { lectureId_subtopicId: { lectureId, subtopicId } },
        select: { prompt: true, modelAnswer: true },
      });
      if (existingPrompt) {
        return NextResponse.json(existingPrompt);
      }
      subtopicTitle = subtopic.title || subtopicTitle;
      lessonMd = [
        `# ${subtopic.lecture.title}`,
        subtopic.title ? `## ${subtopic.title}` : '',
        subtopic.overview,
        subtopic.explanation || '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      if (lessonMd.length < 50) {
        lessonMd = subtopic.lecture.originalContent.slice(0, 8_000);
      }
    } else {
      lessonMd = providedLessonMd;
    }

    if (!isAuthed && lessonMd.length < 50) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!lessonMd || lessonMd.length < 50) {
      return NextResponse.json(
        { error: 'Lesson content too short' },
        { status: 400 }
      );
    }

    const { generateJSON } = await import('@/lib/ai');
    const prompt = [
      'You are writing ONE short-answer question to assess conceptual understanding using ONLY the LESSON below.',
      SOURCE_HANDLING_RULES,
      'Requirements:',
      '- The question must be self-contained and answerable strictly from the LESSON.',
      '- Make it broad and high-level to check understanding of the subtopic overall, not a niche detail.',
      '- Avoid asking for rote memorization of minor facts, numbers, or edge cases.',
      '- Do not require any outside knowledge not present in the LESSON.',
      "- Do NOT include phrases like 'Based on the lesson/content', 'According to the text', or 'From the passage'. Write the question as a standalone item without referencing the lesson/content.",
      'Return ONLY JSON with exactly this shape:',
      '{ "prompt": string, "modelAnswer": string }',
      'Model answer should be concise (2–6 sentences) and aligned with the LESSON.',
      subtopicTitle ? `SUBTOPIC: ${subtopicTitle}` : '',
      wrapSource(lessonMd.slice(0, 6000), 'LESSON'),
    ]
      .filter(Boolean)
      .join('\n');

    const key = crypto
      .createHash('sha256')
      .update([subtopicTitle, lessonMd.slice(0, 6000)].join('|'))
      .digest('hex');
    const run = async (): Promise<{ prompt: string; modelAnswer: string }> => {
      const out: any = await generateJSON(prompt);
      const qPromptRaw = String(out?.prompt || '').trim();
      const modelAnswerRaw = String(out?.modelAnswer || '').trim();
      const qPrompt = stripDependentPhrasing(
        normalizeModelMarkdown(qPromptRaw)
      );
      const modelAnswer = stripDependentPhrasing(
        normalizeModelMarkdown(modelAnswerRaw)
      );
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
    let result = await p;
    if (!result.prompt || !result.modelAnswer) {
      return NextResponse.json(
        { error: 'Could not generate a grounded revision question.' },
        { status: 502 }
      );
    }

    if (lectureId && subtopicId) {
      result = await prisma.shortAnswerPrompt.upsert({
        where: { lectureId_subtopicId: { lectureId, subtopicId } },
        update: {},
        create: {
          lectureId,
          subtopicId,
          prompt: result.prompt,
          modelAnswer: result.modelAnswer,
        },
        select: { prompt: true, modelAnswer: true },
      });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
