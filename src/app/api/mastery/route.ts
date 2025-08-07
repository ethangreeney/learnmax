import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = (session.user as any).id as string;

    const { subtopicId, eloDelta = 5 } = (await req.json()) as {
      subtopicId: string;
      eloDelta?: number;
    };

    if (!subtopicId) {
      return NextResponse.json(
        { error: 'subtopicId is required.' },
        { status: 400 }
      );
    }

    // Create mastery; ignore if already exists
    await prisma.userMastery.upsert({
      where: { userId_subtopicId: { userId, subtopicId } },
      update: {},
      create: { userId, subtopicId },
    });

    // Update ELO
    await prisma.user.update({
      where: { id: userId },
      data: { elo: { increment: eloDelta } },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e?.status || 500;
    console.error('MASTERY_API_ERROR:', e?.stack || e?.message || e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status });
  }
}
