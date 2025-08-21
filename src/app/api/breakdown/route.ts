import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';
import { revalidateTag } from 'next/cache';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const { content, model } = await req.json();

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required.' },
        { status: 400 }
      );
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
      - Aim for 7 subtopics in total. Deviate only if clearly necessary; allowed range is 2 to 12. Never exceed 12.

      Here is the text to analyze:
      ---
      ${content}
      ---
    `;

    const chosenModel =
      (typeof model === 'string' && model.trim()) ||
      process.env.AI_QUALITY_MODEL ||
      'gemini-2.5-pro';
    const aiResponse = await generateJSON(prompt, chosenModel);
    if (userId) {
      await bumpDailyStreak(userId);
      try { revalidateTag(`user-stats:${userId}`); } catch {}
    }
    return NextResponse.json(aiResponse);
  } catch (error: any) {
    console.error('Error in breakdown API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
