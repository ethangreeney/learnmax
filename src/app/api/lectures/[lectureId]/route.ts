import { isSessionWithUser } from '@/lib/session-utils';

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { revalidateTag } from 'next/cache';
import { authOptions } from '@/lib/auth';

type Params = { lectureId: string };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lectureId } = await ctx.params;
    const userId = session.user.id;

    const body = await req.json().catch(() => ({}) as any);
    const { title, starred } = body as { title?: string; starred?: boolean };
    const data: Record<string, any> = {};
    if (typeof title !== 'undefined') {
      if (!title || typeof title !== 'string' || title.trim().length < 3) {
        return NextResponse.json(
          { error: 'Title must be at least 3 characters' },
          { status: 400 }
        );
      }
      data.title = title.trim();
    }
    if (typeof starred !== 'undefined') {
      if (typeof starred !== 'boolean') {
        return NextResponse.json(
          { error: 'Invalid starred value' },
          { status: 400 }
        );
      }
      data.starred = starred;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const owned = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.lecture.update({
      where: { id: lectureId },
      data,
      select: { id: true, title: true, starred: true },
    });
    try {
      revalidateTag(`user-lectures:${userId}`);
    } catch {}
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true, lecture: updated });
  } catch (e: any) {
    console.error('LECTURE_PATCH_ERROR', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<Params> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lectureId } = await ctx.params;
    const userId = session.user.id;

    // Ensure the lecture belongs to the current user
    const owned = await prisma.lecture.findFirst({
      where: { id: lectureId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Preflight: detect optional tables that might not exist in older dev DBs (single round-trip)
    const existsRow = (
      (await prisma.$queryRaw<any[]>`SELECT 
        to_regclass('public."QuizAttempt"') IS NOT NULL AS qa,
        to_regclass('public."UserLectureCompletion"') IS NOT NULL AS ulc,
        to_regclass('public."QuizProgress"') IS NOT NULL AS qp,
        to_regclass('public."QuizReset"') IS NOT NULL AS qr,
        to_regclass('public."TutorMessage"') IS NOT NULL AS tm,
        to_regclass('public."TutorReset"') IS NOT NULL AS tr
      `) || []
    )[0] || {};
    const hasQuizAttempt = Boolean(existsRow.qa);
    const hasUserLectureCompletion = Boolean(existsRow.ulc);
    const hasQuizProgress = Boolean(existsRow.qp);
    const hasQuizReset = Boolean(existsRow.qr);
    const hasTutorMessage = Boolean(existsRow.tm);
    const hasTutorReset = Boolean(existsRow.tr);

    // Ultra-fast single-roundtrip cascade using CTEs in one SQL statement.
    // Only include CTEs for tables that exist (based on preflight flags) to keep this robust across environments.
    const ctes: string[] = [];
    ctes.push(`s AS (SELECT "id" FROM "public"."Subtopic" WHERE "lectureId" = $1)`);
    ctes.push(`q AS (SELECT "id" FROM "public"."QuizQuestion" WHERE "subtopicId" IN (SELECT "id" FROM s))`);
    if (hasQuizAttempt) {
      ctes.push(`qa AS (DELETE FROM "public"."QuizAttempt" WHERE "questionId" IN (SELECT "id" FROM q) RETURNING 1)`);
    }
    if (hasQuizProgress) {
      ctes.push(`qpq AS (DELETE FROM "public"."QuizProgress" WHERE "questionId" IN (SELECT "id" FROM q) RETURNING 1)`);
      ctes.push(`qps AS (DELETE FROM "public"."QuizProgress" WHERE "subtopicId" IN (SELECT "id" FROM s) RETURNING 1)`);
    }
    if (hasQuizReset) {
      ctes.push(`qr AS (DELETE FROM "public"."QuizReset" WHERE "subtopicId" IN (SELECT "id" FROM s) RETURNING 1)`);
    }
    ctes.push(`qq AS (DELETE FROM "public"."QuizQuestion" WHERE "id" IN (SELECT "id" FROM q) RETURNING 1)`);
    ctes.push(`um AS (DELETE FROM "public"."UserMastery" WHERE "subtopicId" IN (SELECT "id" FROM s) RETURNING 1)`);
    if (hasTutorMessage) {
      ctes.push(`tm AS (DELETE FROM "public"."TutorMessage" WHERE "lectureId" = $1 RETURNING 1)`);
    }
    if (hasTutorReset) {
      ctes.push(`tr AS (DELETE FROM "public"."TutorReset" WHERE "lectureId" = $1 RETURNING 1)`);
    }
    ctes.push(`ds AS (DELETE FROM "public"."Subtopic" WHERE "id" IN (SELECT "id" FROM s) RETURNING 1)`);
    if (hasUserLectureCompletion) {
      ctes.push(`ulc AS (DELETE FROM "public"."UserLectureCompletion" WHERE "lectureId" = $1 RETURNING 1)`);
    }
    const sql = `WITH ${ctes.join(',\n')}\nDELETE FROM "public"."Lecture" WHERE "id" = $1`;
    await (prisma as any).$executeRawUnsafe(sql, lectureId);
    try {
      revalidateTag(`user-lectures:${userId}`);
    } catch {}
    try {
      revalidateTag(`user-stats:${userId}`);
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('LECTURE_DELETE_ERROR', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
