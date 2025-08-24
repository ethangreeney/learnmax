import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { rateLimit } from '@/lib/shared/ratelimit';
 

export const runtime = 'nodejs';

type Params = { token: string };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  try {
    const { token } = await ctx.params;
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'anon';
    const key = `share-preview:${token}:${ip}`;
    const rl = rateLimit(key, 30, 60_000);
    if (!rl.ok) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }

    const row = await prisma.lecture.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        title: true,
        originalContent: true,
        createdAt: true,
        isDiscoverable: true,
        shareRevokedAt: true,
        user: { select: { id: true, name: true, username: true } },
        subtopics: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            title: true,
            overview: true,
            explanation: true,
            questions: { select: { id: true } },
          },
        },
      },
    });
    if (!row) return new NextResponse(null, { status: 404 });
    if (row.shareRevokedAt) return new NextResponse(null, { status: 404 });

    const questionCount = row.subtopics.reduce((acc, s) => acc + (s.questions?.length ?? 0), 0);
    const snippet = (row.originalContent || '').slice(0, 500);
    const payload = {
      title: row.title,
      author: row.user?.username || row.user?.name || 'Unknown',
      description: snippet,
      questionCount,
      subtopics: row.subtopics.map((s) => ({ title: s.title, overview: s.overview || '', hasExplanation: Boolean(s.explanation) })),
      isDiscoverable: row.isDiscoverable,
    };
    // best-effort telemetry
    try {
      const origin = req.nextUrl.origin;
      void fetch(origin + '/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'lecture.share.preview', token }),
      });
    } catch {}
    const res = NextResponse.json(payload, { status: 200 });
    res.headers.set('X-Robots-Tag', 'noindex');
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


