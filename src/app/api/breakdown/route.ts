import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { bumpDailyStreak } from '@/lib/streak';
import { revalidateTag } from 'next/cache';
import { buildBreakdownPrompt } from '@/lib/ai-prompts';
import { rateLimit, rateLimitKey } from '@/lib/shared/ratelimit';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = isSessionWithUser(session) ? session.user.id : null;
    const limit = rateLimit(
      rateLimitKey(req, 'breakdown', userId),
      userId ? 15 : 4,
      10 * 60_000
    );
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many lesson requests. Please wait and try again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const content = String(body?.content || '').trim();

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required.' },
        { status: 400 }
      );
    }
    if (content.length > 60_000) {
      return NextResponse.json(
        { error: 'Content is too long. Keep it under 60,000 characters.' },
        { status: 413 }
      );
    }

    const prompt = buildBreakdownPrompt(content);

    const aiResponse = await generateJSON(prompt);
    if (userId) {
      await bumpDailyStreak(userId);
      try {
        revalidateTag(`user-stats:${userId}`);
      } catch {}
    }
    return NextResponse.json(aiResponse);
  } catch (error: any) {
    console.error('Error in breakdown API:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
