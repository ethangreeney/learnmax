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
You are writing a short **subsection** for an existing university lecture. Topic: "${subtopic.title}".

${styleInstruction}

Constraints (important):
- This is a CONTINUATION of a lecture. **Do NOT** add preambles like "Here is a study guide", "This guide provides…", "In this section/lesson…", greetings, or meta-commentary.
- **Do NOT** add an H1/H2 title at the top; start immediately with content.
- Use clean Markdown; `####` subheadings OK, brief bullets encouraged.
- 250–450 words. Keep examples short.

Base the explanation ONLY on this lecture text for context:
---
${subtopic.overview || ''}
---
`;

    const markdownExplanation = await generateText(prompt);

function stripPreamble(md: string): string {
  if (!md) return md;
  let out = md.trimStart();

  // Drop a leading H1/H2 like "Study Guide", "Introduction", "Overview"
  out = out.replace(/^(#{1,3})\s*(?:study guide.*|introduction|overview)\s*\n+/i, '');

  // Drop an opening meta paragraph: "This guide provides…", "In this section…", "Here is a study guide…", "We will explore…"
  // (only removes the *first* such paragraph)
  out = out.replace(
    /^\s*(?:>.*\n)?(?:(?:here is (?:a )?(?:study )?guide)|(?:this\s+(?:guide|section|lesson))|(?:in\s+this\s+(?:guide|section|lesson))|(?:we\s+(?:will|\'ll)\s+(?:explore|cover|discuss))).*?\n\s*\n/si,
    ''
  );

  return out.trimStart();
}


    // Save fresh explanation for default style
    if (style === 'default') {
      await prisma.subtopic.update({
        where: { id: subtopicId },
        data: { explanation: stripPreamble(markdownExplanation) },
      });
    }

    return NextResponse.json({ explanation: stripPreamble(markdownExplanation) });
  } catch (error: any) {
    const status = error?.status || 500;
    console.error('EXPLAIN_DB_API_ERROR:', error?.stack || error?.message || error);
    return NextResponse.json({ error: error.message }, { status });
  }
}
