import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { userQuestion, documentContent } = await req.json() as { userQuestion: string, documentContent: string };

    if (!userQuestion) {
      return NextResponse.json({ error: 'A question is required.' }, { status: 400 });
    }

    const systemPrompt = `
      You are an expert academic tutor. Your primary goal is to help the user learn, both by explaining the provided study material and by answering general knowledge questions that aid in their understanding.

      **YOUR BEHAVIOR:**
      1.  **Prioritize the Document:** First, check if the user's question can be answered using the "DOCUMENT CONTENT" provided below. If it can, base your answer primarily on the document.
      2.  **Use General Knowledge:** If the question is about a general topic or is unrelated to the document, use your own extensive knowledge to provide an accurate and helpful answer.
      3.  **Acknowledge Your Source (If Possible):** When it feels natural, clarify the source of your information. For example:
          - "According to the provided text, the xv6 operating system..."
          - "That's a great general question. Apple Silicon processors are based on the ARM architecture, not RISC-V. Here's a bit more on that..."
      4.  **Be a Helpful Tutor:** Your tone should always be encouraging, clear, and helpful.

      ---
      **DOCUMENT CONTENT (for context, if available):**
      ${documentContent || 'No document has been provided yet.'}
      ---
      
      **USER'S QUESTION:**
      ${userQuestion}
    `;

    const aiTextResponse = await generateText(systemPrompt);
    
    return NextResponse.json({ response: aiTextResponse });

  } catch (error: any) {
    console.error("Error in chat API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
