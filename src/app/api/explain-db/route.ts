import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateText } from '@/lib/ai';

export type ExplanationStyle = 'default' | 'simplified' | 'detailed' | 'example';

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const { subtopicId, style = 'default' } = (await req.json()) as {
      subtopicId: string;
      style?: ExplanationStyle;
    };

    if (!subtopicId) {
      return NextResponse.json(
        { error: 'subtopicId is required.' },
        { status: 400 }
      );
    }

    const subtopic = await prisma.subtopic.findUnique({
      where: { id: subtopicId },
    });
    if (!subtopic) {
      return NextResponse.json({ error: 'Subtopic not found.' }, { status: 404 });
    }

    // If already cached, return it
    if (subtopic.explanation && style === 'default') {
      return NextResponse.json({ explanation: subtopic.explanation });
    }

    let styleInstruction = '';
    switch (style) {
      case 'simplified':
        styleInstruction =
          'Explain in very simple terms, as if for a first-year student.';
        break;
      case 'detailed':
        styleInstruction =
          'Provide a detailed, in-depth explanation suitable for a post-graduate student, covering nuances and complexities.';
        break;
      case 'example':
        styleInstruction =
          'Focus on a concrete, real-world example; keep theory brief, emphasize practical application.';
        break;
      default:
        styleInstruction =
          'Provide a clear and comprehensive explanation suitable for a university undergraduate.';
        break;
    }

    const prompt = `
      You are a University Professor creating a study guide about "${subtopic.title}".
      ${styleInstruction}
      Use clean Markdown with headings (###, ####), lists, and code blocks where helpful.
      Base the explanation on the following lecture text for context:
      ---
      ${subtopic.overview || ''}
    `;

    const markdownExplanation = await generateText(prompt);

    // Save fresh explanation for default style
    if (style === 'default') {
      await prisma.subtopic.update({
        where: { id: subtopicId },
        data: { explanation: markdownExplanation },
      });
    }

    return NextResponse.json({ explanation: markdownExplanation });
  } catch (error: any) {
    const status = error?.status || 500;
    console.error('EXPLAIN_DB_API_ERROR:', error?.stack || error?.message || error);
    return NextResponse.json({ error: error.message }, { status });
  }
}
