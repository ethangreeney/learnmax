import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/ai';

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
        styleInstruction = 'Explain it in very simple terms, as if for a first-year student.';
        break;
      case 'detailed':
        styleInstruction = 'Provide a more detailed, in-depth explanation suitable for a post-graduate student, covering nuances and complexities.';
        break;
      case 'example':
        styleInstruction = 'Focus on providing a concrete, real-world example of the concept in action. Keep the theory brief and emphasize the practical application.';
        break;
      default:
        styleInstruction = 'Provide a clear and comprehensive explanation suitable for a university undergraduate.';
        break;
    }

    const prompt = `
      You are a University Professor creating a study guide. Your task is to explain the concept of "${subtopicTitle}".

      **CRITICAL INSTRUCTIONS:**
      1.  **DO NOT WRITE A PREAMBLE OR INTRODUCTION.** Your response must begin *directly* with the main Markdown heading (e.g., "### Introduction to xv6"). Do not include any conversational filler.
      2.  **Prioritize Concepts:** Your primary goal is to explain the underlying computer science concepts. Use code snippets only as supporting examples.
      3.  **Explain the "Why":** Do not just describe what a piece of code is. Explain *why* it exists and the problem it solves.
      4.  **University-Level Depth:** The explanation must be detailed and conceptually rich.
      5.  **Formatting:** Use clean Markdown with paragraphs, headings (\`###\`, \`####\`), lists, and code blocks (\`\`\`c).

      ---
      **EXAMPLE OF GOOD VS. BAD EXPLANATION:**

      **BAD (Shallow):**
      \`uint64 kstack;\` // Virtual address of kernel stack

      **GOOD (Deep, University-Level):**
      #### Kernel Stack (\`kstack\`)
      Each process has a private **kernel stack**, whose address is stored in \`kstack\`. This is separate from the process's user stack. When a process makes a system call or an interrupt occurs, the CPU switches from user mode to kernel mode. At this point, it needs a secure place to execute kernel code and save the user registers—this is what the kernel stack is for. This separation is a critical security boundary, preventing user code from interfering with the kernel's operation.
      ---

      Now, using the full lecture text below for context, generate a deep, university-level explanation for "${subtopicTitle}".

      **LECTURE TEXT:**
      ${content}
    `;

    const markdownExplanation = await generateText(prompt);

    return NextResponse.json({ explanation: markdownExplanation });

  } catch (error: any) {
    console.error("Error in explain API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
