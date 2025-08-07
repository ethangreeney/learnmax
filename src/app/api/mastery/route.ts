import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;

    const { subtopicId, eloDelta = 5 } = (await req.json()) as {
      subtopicId: string;
      eloDelta?: number;
    };

    if (!subtopicId) {
      return NextResponse.json({ error: 'subtopicId is required.' }, { status: 400 });
    }

    await prisma.userMastery.upsert({
      where: { userId_subtopicId: { userId, subtopicId } },
      update: {},
      create: { userId, subtopicId },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { elo: { increment: eloDelta } },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('MASTERY_API_ERROR:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}
