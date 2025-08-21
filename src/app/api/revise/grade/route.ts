import { NextRequest, NextResponse } from 'next/server';
import prisma, { INTERACTIVE_TX_OPTIONS } from '@/lib/prisma';
import { revalidateTag } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import crypto from 'crypto';

// Simple in-memory cache to stabilize repeated grading for identical inputs in a single server instance
const gradeCache = new Map<string, { score: number; modelAnswer?: string }>();

// Deterministic hashing to stabilize grading for identical answers
function stableHash(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isAuthed = isSessionWithUser(session);
    const userId = isAuthed ? session.user.id : '';
    const body = (await req.json().catch(() => ({}))) as {
      lectureId?: string;
      prompt?: string;
      answer?: string;
      suppressElo?: boolean;
      lessonMd?: string;
    };
    const lectureId = String(body?.lectureId || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const answer = String(body?.answer || '').trim();
    const suppressElo = Boolean(body?.suppressElo);
    const providedLessonMd = String(body?.lessonMd || '').trim();
    if ((!lectureId && (!providedLessonMd || providedLessonMd.length < 50)) || !prompt || !answer) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Ensure lecture ownership and pull composite lesson text for grounding
    let lessonMd = '';
    if (providedLessonMd && providedLessonMd.length >= 50) {
      // Anonymous or explicit grading using provided content (demo path)
      lessonMd = providedLessonMd.slice(0, 8000);
    } else {
      if (!isAuthed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const lecture = await prisma.lecture.findFirst({
        where: { id: lectureId, userId },
        select: {
          title: true,
          originalContent: true,
          subtopics: { orderBy: { order: 'asc' }, select: { title: true, overview: true, explanation: true } },
        },
      });
      if (!lecture) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const parts: string[] = [`# ${lecture.title}`];
      for (const s of (lecture.subtopics || [])) {
        if (s.title) parts.push(`\n## ${s.title}`);
        if (s.overview) parts.push(s.overview);
        if (s.explanation) parts.push(s.explanation);
      }
      lessonMd = (parts.join('\n\n').trim() || lecture.originalContent || '').slice(0, 8000);
    }
    if (!lessonMd || lessonMd.length < 50) {
      return NextResponse.json({ error: 'Lecture content too short' }, { status: 400 });
    }

    // Deterministic cache key for consistency on repeated grading attempts
    const key = stableHash([(lectureId || 'demo'), prompt, answer].join('|'));
    const cached = gradeCache.get(key);

    // Strict grading via AI with numeric 0..10, grounded in lesson only.
    const { generateJSON } = await import('@/lib/ai');
    const { getSelectedModelFromRequest } = await import('@/lib/ai-choice');

    // Detect if this is the calibrated Next.js + Prisma composite index question (robust-ish heuristic)
    const p = prompt.toLowerCase();
    const matchesIndexCalibration =
      p.includes('composite') &&
      p.includes('index') &&
      p.includes('user') &&
      p.includes('starred') &&
      (p.includes('lastopenedat') || p.includes('last_opened_at') || p.includes('last opened')) &&
      p.includes('createdat');

    const calibrationBlock = `Short-answer calibration
Question
In a Next.js + Prisma app that lists a user’s lectures, why define a composite database index on (userId, starred, lastOpenedAt, createdAt)? Explain how it supports a query that shows a single user’s lectures with starred first, then ordered by recent activity (fall back to createdAt if needed). Answer in 3–6 sentences.

Model 2/10 answer (very weak):
It makes things faster. The index lets the database find lectures and sort them. Without it the query would be slow, so this just improves performance.

Model 5/10 answer (adequate):
Filtering by userId uses the first column of the index, and putting starred next groups starred items before others. Including lastOpenedAt and createdAt lets the database follow index order for recency without a big sort. This improves performance for the user’s lecture list.

Model 10/10 answer (excellent):
The index is ordered to match the access pattern: filter on userId (leftmost key), then group by starred so starred rows are contiguous and can appear first, and finally order by recency using lastOpenedAt with a deterministic fallback to createdAt. Because the WHERE userId = ? and ORDER BY starred, lastOpenedAt, createdAt align with the index key order, the planner can do an index scan and avoid a full sort on each request. This keeps the “starred first, then most recently opened” view fast even for large per-user datasets. Using both timestamps ensures stable ordering when lastOpenedAt is null or identical across rows, so we still get a consistent recency tie-break via createdAt. Net effect: minimal heap reads and predictable latency for the dashboard list.

Scoring guide (0–10):

- Mentions filtering on userId as the index’s leftmost key (2)
- Explains why starred is in the key (groups/starred-first ordering) (2)
- Explains why both lastOpenedAt and createdAt are included (recency + fallback/tie-break) (2)
- Connects key order to avoiding a sort via index scan / ordered retrieval (2)
- Notes stability/null handling or performance nuance (covering/selectivity/cost) (2)

Use closest model match; accept equivalent wording and DB-agnostic phrasing.`;

    const genericRubric = `Scoring rules (0-10):
- 10: Completely correct and comprehensive; covers all key points.
- 8-9: Correct and clear; minor omissions acceptable when core ideas are present.
- 6-7: Mostly correct; core ideas present even if incomplete or slightly imprecise.
- 3-5: Partial understanding; some correct ideas mixed with gaps/misconceptions.
- 1-2: Minimal understanding; major errors or missing key concepts.
- 0: Incorrect or off-topic.

Leniency guidance:
- Prefer rounding borderline scores up (e.g., a strong 7 can be graded as 8).
- Accept equivalent phrasing and synonyms; do not penalize minor grammar.
- Award partial credit generously when key ideas are named correctly.`;

    const gradingPrompt = matchesIndexCalibration
      ? `You are grading a short-answer response using ONLY the provided LESSON.
Return ONLY JSON exactly in this shape: { "score": number, "modelAnswer": string }
Use the following calibration STRICTLY when the prompt matches or is a close paraphrase. Score out of 10 by awarding 0–2 points per bullet in the scoring guide (allow partial credit 1 point when partially satisfied). Prefer 3–6 sentences but do not penalize length if content is correct. Accept equivalent wording and DB-agnostic phrasing.
---
CALIBRATION
${calibrationBlock}
---
LESSON:
${lessonMd}
---
PROMPT:
${prompt}
---
LEARNER_ANSWER (hash:${key.slice(0, 8)}):
${answer}
---`
      : `You are grading a short-answer response using ONLY the provided LESSON.
Return ONLY JSON: { "score": number, "modelAnswer": string }
${genericRubric}
Ignore minor grammar/spelling. Ground strictly in the LESSON. Do not invent facts.
Ensure identical answers produce the same score for the same prompt.
---
LESSON:
${lessonMd}
---
PROMPT:
${prompt}
---
LEARNER_ANSWER (hash:${key.slice(0, 8)}):
${answer}
---`;
    // Generous timeout and determinism via seed when supported by backend
    let cameFromCache = false;
    let score = 0;
    let modelAnswer = '';
    if (cached) {
      cameFromCache = true;
      score = Math.max(0, Math.min(10, Number((cached as any)?.score)));
      modelAnswer = String((cached as any)?.modelAnswer || '').trim().slice(0, 3000);
    } else {
      let result: any = {};
      try {
        const preferred = 'gemini-2.5-flash';
        result = await generateJSON(
          gradingPrompt,
          'gemini-2.5-flash',
          undefined
        );
      } catch {}
      score = Math.max(0, Math.min(10, Number(result?.score)));
      if (!Number.isFinite(score)) score = 0;
      if (score === 7) score = 8;
      try {
        const { normalizeModelMarkdown, stripDependentPhrasing } = await import('@/lib/text/normalize-markdown');
        modelAnswer = stripDependentPhrasing(
          normalizeModelMarkdown(String(result?.modelAnswer || ''))
        ).slice(0, 3000);
      } catch {
        modelAnswer = String(result?.modelAnswer || '').trim().slice(0, 3000);
      }
    }

    // Award ELO once per (user, lecture, prompt, answer) using stable hash key
    let appliedDelta = 0;
    // Do not award ELO when anonymous or when suppressElo is true
    if (!suppressElo && isAuthed && !cameFromCache) {
      const ELO_REVISE_SHORT_8PLUS = parseInt(process.env.ELO_REVISE_SHORT_8PLUS || '20', 10);
      let delta = 0;
      // Award points for any explanation strictly over 7 (i.e., 8–10). A lenient 7 is bumped to 8 above.
      if (score > 7) delta = ELO_REVISE_SHORT_8PLUS;

      if (delta && Number.isFinite(delta) && delta !== 0) {
        try {
          await prisma.$transaction(async (tx) => {
            // Dedupe by user/key
            await tx.eloEvent.create({
              data: {
                userId,
                kind: 'revise-short',
                ref: key,
                delta,
              },
            });
            await tx.user.update({ where: { id: userId }, data: { elo: { increment: delta } } });
          }, INTERACTIVE_TX_OPTIONS);
          appliedDelta = delta;
          try {
            revalidateTag(`user-stats:${userId}`);
          } catch {}
        } catch (e: any) {
          // Unique constraint violation means already awarded
          if (!(e && typeof e === 'object' && (e as any).code === 'P2002')) {
            // Swallow other errors, still return grade
          }
        }
      }
    }

    // Persist short-answer grade for lifetime stats (use raw SQL upsert for compatibility)
    if (isAuthed) {
      const promptHash = stableHash([lectureId, prompt].join('|'));
      try {
        await prisma.$executeRaw`INSERT INTO "ShortAnswerGrade" ("userId", "lectureId", "promptHash", "score") VALUES (${userId}, ${lectureId || null}, ${promptHash}, ${score}) ON CONFLICT ("userId", "promptHash") DO UPDATE SET "score" = EXCLUDED."score"`;
      } catch (e: any) {
        try {
          await prisma.$executeRaw`INSERT INTO "ShortAnswerGrade" ("userId", "lectureId", "promptHash", "score") VALUES (${userId}, ${null}, ${promptHash}, ${score}) ON CONFLICT ("userId", "promptHash") DO UPDATE SET "score" = EXCLUDED."score"`;
        } catch (e2: any) {
          console.error('ShortAnswerGrade insert failed', { userId, lectureId, err: String(e2?.message || e2) });
        }
      }
    }

    const out = { score, modelAnswer, eloDelta: appliedDelta };
    gradeCache.set(key, out);
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


