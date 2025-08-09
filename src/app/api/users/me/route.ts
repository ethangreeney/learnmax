import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = (session.user as any)?.id as string;
    const body = await req.json().catch(() => ({}));
    const data: any = {};
    if (typeof body.name === 'string') data.name = body.name.trim().slice(0, 80);
    if (typeof body.username === 'string') data.username = body.username.trim().slice(0, 40).toLowerCase();
    if (typeof body.bio === 'string') data.bio = body.bio.trim().slice(0, 280);
    if (typeof body.image === 'string') data.image = body.image.trim();

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    // Ensure username unique if provided
    if (data.username) {
      const exists = await prisma.user.findFirst({ where: { username: data.username, NOT: { id: userId } }, select: { id: true } });
      if (exists) return NextResponse.json({ error: 'Username taken' }, { status: 409 });
    }

    const user = await prisma.user.update({ where: { id: userId }, data, select: { id: true, name: true, username: true, bio: true, image: true, elo: true, streak: true } });
    return NextResponse.json({ ok: true, user });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}

export async function GET() {
  try {
    const session = await requireSession();
    const userId = (session.user as any)?.id as string;
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        bio: true,
        image: true,
        elo: true,
        streak: true,
        _count: { select: { masteredSubtopics: true } },
      },
    });
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // If no stored avatar, fall back to provider (e.g., Google) and persist once
    const providerImage = (session.user as any)?.image as string | undefined;
    if (!user.image && providerImage && typeof providerImage === 'string') {
      try {
        user = await prisma.user.update({
          where: { id: userId },
          data: { image: providerImage },
          select: {
            id: true,
            name: true,
            username: true,
            bio: true,
            image: true,
            elo: true,
            streak: true,
            _count: { select: { masteredSubtopics: true } },
          },
        });
      } catch {
        // non-fatal if update fails; still return a response with fallback image below
        user = { ...user, image: providerImage } as typeof user;
      }
    }
    const agg = await prisma.quizAttempt.groupBy({
      by: ['isCorrect'],
      where: { userId },
      _count: { _all: true },
    });
    const total = agg.reduce((a, r) => a + r._count._all, 0);
    const correct = agg.find((r) => r.isCorrect)?._count._all || 0;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        bio: user.bio,
        image: user.image || providerImage || null,
        elo: user.elo,
        streak: user.streak,
        masteredCount: user._count.masteredSubtopics,
        quiz: { totalAttempts: total, correct, accuracy },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}


