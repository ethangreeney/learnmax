import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const { content, model } = await req.json();

    if (!content) {
      return NextResponse.json({ error: 'Content is required.' }, { status: 400 });
    }

    // A detailed prompt for generating a topic breakdown.
    const prompt = `
      As an expert instructional designer, analyze the following text and break it down into a structured learning path.
      The output must be a JSON object with two keys: "topic" (a concise title for the overall subject) and "subtopics" (an array of objects).
      Each subtopic object must have the following keys:
      - "title": A clear, concise title for the subtopic.
      - "importance": A rating of "high", "medium", or "low".
      - "difficulty": A number from 1 (easy) to 3 (hard).
      - "overview": A one-sentence summary of what the subtopic covers.
      - Generate between 8 and 15 subtopics in total. Aim for about 12 on average. Never exceed 15.

      Here is the text to analyze:
      ---
      ${content}
      ---
    `;

    const aiResponse = await generateJSON(prompt, model);
    if (userId) {
      await bumpDailyStreak(userId);
    }
    return NextResponse.json(aiResponse);

  } catch (error: any) {
    console.error("Error in breakdown API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
