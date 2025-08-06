import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';

export type ExplanationStyle = 'default' | 'simplified' | 'detailed' | 'example';

export async function POST(req: NextRequest) {
  try {
    const { content, subtopicTitle, style = 'default' } = await req.json() as { content: string, subtopicTitle: string, style?: ExplanationStyle };

    if (!content || !subtopicTitle) {
      return NextResponse.json({ error: 'Content or a subtopic title is required.' }, { status: 400 });
    }

    let styleInstruction = '';
    switch (style) {
      case 'simplified':
        styleInstruction = 'Explain it in very simple terms, as if for a complete beginner. Use analogies and avoid jargon.';
        break;
      case 'detailed':
        styleInstruction = 'Provide a more detailed, in-depth explanation suitable for a university-level student. Cover nuances and complexities.';
        break;
      case 'example':
        styleInstruction = 'Focus on providing a concrete, real-world example of the concept in action. Keep the theory brief and emphasize the practical application.';
        break;
      default:
        styleInstruction = 'Provide a clear and comprehensive explanation of the core concept.';
        break;
    }

    const prompt = `
      You are a world-class educator creating a study guide.
      Your task is to explain the concept of "${subtopicTitle}".

      **Instruction:** ${styleInstruction}

      **Formatting Rules:**
      - The output MUST be a JSON object with a single key: "explanation".
      - The "explanation" value MUST be a string containing well-structured Markdown.
      - Use '##' for main section titles and '###' for sub-sections.
      - Use bold text ('**term**') for all key terms.
      - **CRITICAL RULE: Do NOT use Markdown code blocks (e.g., \`\`\`c ... \`\`\` or \`code\`). Instead, present any code or struct names as simple inline bold text.** For example, instead of writing \`struct trapframe\`, you must write **struct trapframe**. This is a strict requirement.

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
