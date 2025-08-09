import { NextRequest, NextResponse } from 'next/server';
import { generateText } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const { userQuestion, documentContent, model } = await req.json() as { userQuestion: string, documentContent: string, model?: string };

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

    const t0 = Date.now();
    const aiTextResponse = await generateText(systemPrompt, model);
    const ms = Date.now() - t0;
    const used = model || process.env.GEMINI_MODEL || 'default';
    // Count chat interactions towards streak if authenticated
    if (userId) {
      await bumpDailyStreak(userId);
    }
    // Expose simple timing for debugging UX
    return NextResponse.json({ response: aiTextResponse, debug: { model: used, ms } });

  } catch (error: any) {
    console.error("Error in chat API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
