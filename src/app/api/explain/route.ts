import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { content, subtopicTitle } = await req.json();

    if (!content || !subtopicTitle) {
      return NextResponse.json({ error: 'Content or a subtopic title is required.' }, { status: 400 });
    }

    const prompt = `
      You are a world-class educator creating a study guide.
      Your task is to provide a detailed, in-depth explanation of the core concept of "${subtopicTitle}".

      **Formatting Rules:**
      - The output MUST be a JSON object with a single key: "explanation".
      - The "explanation" value MUST be a string containing well-structured Markdown.
      - Use '##' for main section titles. These are the most important headings.
      - Use '###' for sub-section titles.
      - Use bold text ('**term**') for all key terms and definitions.
      - Use bulleted or numbered lists for steps, components, or key points.
      - Use ample whitespace and structure to create a highly readable document.

      Use the full lecture text below for context.
      ---
      ${content}
      ---
    `;

    const aiResponse = await generateJSON(prompt);
    return NextResponse.json(aiResponse);

  } catch (error: any) {
    console.error("Error in explain API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
