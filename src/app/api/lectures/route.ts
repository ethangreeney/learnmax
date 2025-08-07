import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-extraction';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateJSON } from '@/lib/ai';
import { isSessionWithUser } from '@/lib/session-utils';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const runtime = 'nodejs';
export const maxDuration = 60;

type Breakdown = {
  topic: string;
  subtopics: Array<{ title: string; importance: string; difficulty: number; overview?: string }>;
};

type QuizOut = {
  questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string; subtopicTitle?: string }>;
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;

    const contentType = req.headers.get('content-type') || '';
    let text = '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided. Please upload a single PDF.' }, { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json({ error: 'Invalid file type. Only PDF files are accepted.' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdf(buffer);
      text = (data.text || '').replace(/\s{2,}/g, ' ').trim();
      if (!text) {
        return NextResponse.json({ error: 'Could not extract text from the PDF. The file may only contain images.' }, { status: 422 });
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      text = (body?.content || '').toString();
      if (!text.trim()) {
        return NextResponse.json({ error: 'Content is required.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported content type.' }, { status: 415 });
    }

    const breakdownPrompt = `
      As an expert instructional designer, analyze the following text and break it down into a structured learning path.
      Output JSON with keys: "topic" and "subtopics".
      ---
      ${text}
    `;
    const bd = (await generateJSON(breakdownPrompt)) as Breakdown;

    const quizPrompt = `
      You are an expert in educational assessments. Generate a quiz based on the subtopics.
      ---
      ${JSON.stringify(bd.subtopics, null, 2)}
    `;
    const qz = (await generateJSON(quizPrompt)) as QuizOut;

    const result = await prisma.$transaction(async (tx: TransactionClient) => {
      const lecture = await tx.lecture.create({
        data: { title: bd.topic || 'Untitled', originalContent: text, userId },
      });

      const subtopics = await Promise.all(
        bd.subtopics.map((s, idx) =>
          tx.subtopic.create({
            data: {
              order: idx,
              title: s.title,
              importance: s.importance,
              difficulty: s.difficulty,
              overview: s.overview || '',
              lectureId: lecture.id,
            },
          })
        )
      );

      const byTitle = new Map<string, string>();
      for (const st of subtopics) byTitle.set(st.title.trim().toLowerCase(), st.id);

      for (const q of qz.questions || []) {
        const matchTitle = (q.subtopicTitle || '').trim().toLowerCase();
        const subtopicId = byTitle.get(matchTitle) ?? subtopics[0]?.id;
        if (!subtopicId) continue;
        await tx.quizQuestion.create({
          data: {
            prompt: q.prompt,
            options: q.options as unknown as any,
            answerIndex: q.answerIndex,
            explanation: q.explanation,
            subtopicId,
          },
        });
      }

      return lecture;
    });

    return NextResponse.json({ lectureId: result.id }, { status: 201 });
  } catch (e: any) {
    console.error('LECTURES_API_ERROR:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}
