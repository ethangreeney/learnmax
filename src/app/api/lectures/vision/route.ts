import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateJSONFromPdf, PRIMARY_MODEL } from '@/lib/ai';
import { isSessionWithUser } from '@/lib/session-utils';
import { buildPdfBreakdownPrompt } from '@/lib/ai-prompts';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const limit = rateLimit(
      rateLimitKey(req, 'pdf-vision', userId),
      8,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many PDF requests. Please wait and try again.' },
        { status: 429 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Upload a PDF via multipart/form-data' },
        { status: 415 }
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are accepted.' },
        { status: 400 }
      );
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'PDF is too large. The maximum file size is 20 MB.' },
        { status: 413 }
      );
    }

    const prompt = buildPdfBreakdownPrompt();

    const pdf = Buffer.from(await file.arrayBuffer());
    const json = await generateJSONFromPdf(pdf, file.name, prompt);
    const topic =
      typeof json?.topic === 'string' && json.topic.trim()
        ? json.topic.trim()
        : 'Generating lesson... Please Wait';
    const subtopics = Array.isArray(json?.subtopics)
      ? json.subtopics.slice(0, 12)
      : [];

    const lecture = await prisma.lecture.create({
      data: {
        title: topic,
        originalContent: 'PDF upload',
        userId,
        lastOpenedAt: new Date(),
      },
    });

    if (subtopics.length) {
      await prisma.subtopic.createMany({
        data: subtopics.map((subtopic: any, index: number) => ({
          order: index,
          title: String(subtopic?.title || `Section ${index + 1}`),
          importance: String(subtopic?.importance || 'medium'),
          difficulty: Math.max(
            1,
            Math.min(3, Number(subtopic?.difficulty) || 2)
          ),
          overview: String(subtopic?.overview || ''),
          lectureId: lecture.id,
        })),
      });
    }

    try {
      revalidateTag(`user-lectures:${userId}`);
      revalidateTag(`user-stats:${userId}`);
    } catch {}

    return NextResponse.json({
      lectureId: lecture.id,
      debug: { model: PRIMARY_MODEL },
    });
  } catch (error: any) {
    console.error('VISION_UPLOAD_ERROR', error);
    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
