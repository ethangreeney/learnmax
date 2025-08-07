import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-extraction';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateJSON } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Breakdown = {
  topic: string;
  subtopics: Array<{
    title: string;
    importance: string;
    difficulty: number;
    overview?: string;
  }>;
};

type QuizOut = {
  questions: Array<{
    prompt: string;
    options: string[];
    answerIndex: number;
    explanation: string;
    subtopicTitle?: string;
  }>;
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = (session.user as any).id as string;

    const contentType = req.headers.get('content-type') || '';
    let text = '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'No file provided. Please upload a single PDF.' },
          { status: 400 }
        );
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json(
          { error: 'Invalid file type. Only PDF files are accepted.' },
          { status: 400 }
        );
      }
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdf(buffer);
      text = (data.text || '').replace(/\s{2,}/g, ' ').trim();
      if (!text) {
        return NextResponse.json(
          {
            error:
              'Could not extract text from the PDF. The file may only contain images.',
          },
          { status: 422 }
        );
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      text = (body?.content || '').toString();
      if (!text?.trim()) {
        return NextResponse.json(
          { error: 'Content is required.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported content type.' },
        { status: 415 }
      );
    }

    // Ask AI once for breakdown
    const breakdownPrompt = `
      As an expert instructional designer, analyze the following text and break it down into a structured learning path.
      Output JSON with keys: "topic" and "subtopics".
      Each subtopic: { "title", "importance": "high"|"medium"|"low", "difficulty": 1|2|3, "overview": string }.
      ---
      ${text}
    `;
    const bd = (await generateJSON(breakdownPrompt)) as Breakdown;

    // Ask AI for quiz from subtopics
    const quizPrompt = `
      You are an expert in educational assessments. Generate a quiz based on the subtopics.
      Response MUST be a single JSON object with key "questions".
      For each subtopic, create exactly one multiple-choice question:
      { "prompt", "options": [4 strings], "answerIndex": 0-3, "explanation", "subtopicTitle" }.
      ---
      ${JSON.stringify(bd.subtopics, null, 2)}
      ---
    `;
    const qz = (await generateJSON(quizPrompt)) as QuizOut;

    // Persist everything in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const lecture = await tx.lecture.create({
        data: {
          title: bd.topic || 'Untitled',
          originalContent: text,
          userId,
        },
      });

      // Create subtopics with order
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

      // Index subtopics by title (case-insensitive) for linking questions
      const byTitle = new Map<string, string>();
      for (const st of subtopics) {
        byTitle.set(st.title.trim().toLowerCase(), st.id);
      }

      // Create quiz questions
      for (const q of qz.questions || []) {
        const matchTitle = (q.subtopicTitle || '').trim().toLowerCase();
        const subtopicId =
          byTitle.get(matchTitle) ??
          // fallback: try contains
          Array.from(byTitle.entries()).find(([t]) => t.includes(matchTitle))
            ?.[1] ??
          subtopics[0]?.id; // last resort: first subtopic

        if (!subtopicId) continue;

        await tx.quizQuestion.create({
          data: {
            prompt: q.prompt,
            options: q.options as unknown as any, // Prisma Json
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
    const status = e?.status || 500;
    console.error('LECTURES_API_ERROR:', e?.stack || e?.message || e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status });
  }
}
