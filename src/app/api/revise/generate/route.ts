import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import {
  normalizeModelMarkdown,
  stripDependentPhrasing,
} from '@/lib/text/normalize-markdown';
import { SOURCE_HANDLING_RULES, wrapSource } from '@/lib/ai-prompts';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

type ShortQ = {
  prompt: string;
  modelAnswer?: string;
  rubric?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const limit = rateLimit(
      rateLimitKey(req, 'revision-set', userId),
      20,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many revision requests. Please wait and try again.' },
        { status: 429 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      size?: number;
      subtopicId?: string;
    };
    const lectureId = String(body?.lectureId || '').trim();
    const subtopicId = String(body?.subtopicId || '').trim();
    // Force exactly two short-answer questions for revision flow
    const size = 2;
    if (!lectureId) {
      return NextResponse.json(
        { error: 'lectureId required' },
        { status: 400 }
      );
    }
    const lecture = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: {
        id: true,
        title: true,
        originalContent: true,
        subtopics: {
          orderBy: { order: 'asc' },
          select: { id: true, title: true, overview: true, explanation: true },
        },
      },
    });
    if (!lecture) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Build lesson markdown, optionally scoped to a single subtopic when provided
    let lessonMd = '';
    if (subtopicId) {
      const sub = lecture.subtopics.find((s) => s.id === subtopicId);
      if (sub) {
        const parts: string[] = [];
        parts.push(`# ${lecture.title}`);
        const title = (sub.title || '').trim();
        const overview = (sub.overview || '').trim();
        const explanation = (sub.explanation || '').trim();
        if (title) parts.push(`\n## ${title}`);
        if (overview) parts.push(overview);
        if (explanation) parts.push(explanation);
        const scoped = parts.join('\n\n').trim();
        lessonMd =
          scoped && scoped.length >= 50
            ? scoped
            : lecture.originalContent || '';
      }
    }
    if (!lessonMd) {
      const blocks: string[] = [];
      blocks.push(`# ${lecture.title}`);
      for (const s of lecture.subtopics) {
        const title = (s.title || '').trim();
        const overview = (s.overview || '').trim();
        const explanation = (s.explanation || '').trim();
        if (title) blocks.push(`\n## ${title}`);
        if (overview) blocks.push(overview);
        if (explanation) blocks.push(explanation);
      }
      const composite = blocks.join('\n\n').trim() || lecture.originalContent;
      lessonMd = composite.length >= 50 ? composite : lecture.originalContent;
    }
    if (!lessonMd || lessonMd.trim().length < 50) {
      return NextResponse.json(
        { error: 'Lecture content is too short for revise' },
        { status: 400 }
      );
    }

    // Generate short-answer prompts + model answers via AI (exactly two)
    const shortCount = size;
    const shortQs: ShortQ[] = [];
    if (shortCount > 0) {
      // Use ai.ts generateJSON with a strict rubric
      const { generateJSON } = await import('@/lib/ai');
      const prompt = `Using ONLY the LESSON below, create ${shortCount} short-answer questions with model answers.
${SOURCE_HANDLING_RULES}
Return only JSON:
{ "questions": [ { "prompt": "string", "modelAnswer": "string" } ] }
Rules:
- Questions must target key concepts, definitions, mechanisms, or reasoning steps from the lesson.
- The question text must be self-contained and must not include phrases like "Based on the lesson/content", "According to the text", or similar dependent wording.
- Model answers must be concise (2–6 sentences) and complete.
- Do not include any content not grounded in the lesson.
${wrapSource(lessonMd.slice(0, 6000), 'LESSON')}`;
      const json: any = await generateJSON(prompt);
      const arr = Array.isArray(json?.questions) ? json.questions : [];
      for (const q of arr) {
        const p = stripDependentPhrasing(
          normalizeModelMarkdown(String(q?.prompt || '').trim())
        );
        const a = stripDependentPhrasing(
          normalizeModelMarkdown(String(q?.modelAnswer || '').trim())
        );
        if (p && a) shortQs.push({ prompt: p, modelAnswer: a });
        if (shortQs.length >= shortCount) break;
      }
      if (shortQs.length !== shortCount) {
        return NextResponse.json(
          { error: 'Could not generate a complete revision set.' },
          { status: 502 }
        );
      }
    }

    // Compose and shuffle (short answers only)
    type Mixed = { kind: 'short'; data: any };
    const mixed: Mixed[] = [];
    for (const q of shortQs) mixed.push({ kind: 'short', data: q });
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }

    return NextResponse.json({ questions: mixed });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
