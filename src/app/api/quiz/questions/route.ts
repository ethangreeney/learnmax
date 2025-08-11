import { NextRequest, NextResponse } from 'next/server';
import prisma, { INTERACTIVE_TX_OPTIONS } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

type IncomingQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

// Basic near-duplicate detection for prompts to prevent storing very similar questions
const STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'for',
  'to',
  'in',
  'on',
  'at',
  'by',
  'is',
  'are',
  'was',
  'were',
  'be',
  'with',
  'as',
  'that',
  'this',
  'it',
  'its',
  'from',
  'into',
  'than',
  'then',
  'but',
  'not',
  'if',
  'any',
  'all',
  'no',
  'one',
  'two',
  'there',
  'their',
  'between',
  'you',
  'can',
  'will',
  'have',
  'has',
  'had',
  'which',
]);
const SIMILARITY_THRESHOLD: number =
  Number(process.env.QUIZ_SIMILARITY_THRESHOLD || '') || 0.6;
function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) || [];
}
function significantWords(s: string): string[] {
  return words(s).filter((w) => w.length >= 4 && !STOP.has(w));
}
function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let intersect = 0;
  for (const w of A) if (B.has(w)) intersect++;
  const union = A.size + B.size - intersect;
  return union > 0 ? intersect / union : 0;
}
function isPromptSimilarToAny(
  prompt: string,
  existing: string[],
  threshold = SIMILARITY_THRESHOLD
): boolean {
  if (!prompt || !existing?.length) return false;
  const ta = significantWords(prompt);
  for (const ex of existing) {
    const tb = significantWords(ex);
    const sim = jaccardSimilarity(ta, tb);
    if (sim >= threshold) return true;
  }
  return false;
}

function shuffleOptionsWithAnswer(
  options: string[],
  answerIndex: number
): { options: string[]; answerIndex: number } {
  const pairs = options.map((opt, idx) => ({ opt, idx }));
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  const newOptions = pairs.map((p) => p.opt);
  const newAnswerIndex = pairs.findIndex((p) => p.idx === answerIndex);
  return { options: newOptions, answerIndex: newAnswerIndex };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      subtopicId?: string;
      questions?: IncomingQuestion[];
      replace?: boolean;
    };
    const subtopicId = String(body?.subtopicId || '').trim();
    const questions = Array.isArray(body?.questions) ? body.questions : [];
    if (!subtopicId) {
      return NextResponse.json(
        { error: 'subtopicId is required' },
        { status: 400 }
      );
    }

    // Ensure ownership: subtopic belongs to a lecture owned by the current user
    const subtopic = await prisma.subtopic.findFirst({
      where: { id: subtopicId, lecture: { userId } },
      select: { id: true },
    });
    if (!subtopic) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch existing questions for this subtopic
    const existing = await prisma.quizQuestion.findMany({
      where: { subtopicId },
      select: {
        id: true,
        prompt: true,
        options: true,
        answerIndex: true,
        explanation: true,
      },
    });

    // Cap at two questions per subtopic for now (to match UI expectation)
    const REQUIRED = 2;
    const replace = Boolean(body?.replace);
    if (!replace && existing.length >= REQUIRED) {
      return NextResponse.json({
        questions: existing.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options as unknown as string[],
          answerIndex: q.answerIndex,
          explanation: q.explanation,
        })),
      });
    }

    // Validate incoming payload; only take what we need to fill up to REQUIRED
    const toInsert: IncomingQuestion[] = [];
    const existingPrompts = existing
      .map((q) => String(q.prompt || '').trim())
      .filter(Boolean);
    for (const q of questions) {
      const ok =
        q &&
        typeof q.prompt === 'string' &&
        q.prompt.trim() &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.answerIndex === 'number' &&
        q.answerIndex >= 0 &&
        q.answerIndex < 4 &&
        typeof q.explanation === 'string';
      if (ok) {
        // Skip near-duplicates against existing and already staged insertions
        const dupAgainstExisting = isPromptSimilarToAny(
          q.prompt,
          existingPrompts
        );
        const dupAgainstNew = isPromptSimilarToAny(
          q.prompt,
          toInsert.map((x) => x.prompt)
        );
        if (dupAgainstExisting || dupAgainstNew) {
          continue;
        }
        const trimmed = q.options.map((o) => String(o));
        const sh = shuffleOptionsWithAnswer(trimmed, q.answerIndex);
        toInsert.push({
          prompt: q.prompt.trim(),
          options: sh.options,
          answerIndex: sh.answerIndex,
          explanation: q.explanation,
        });
      }
      if (!replace && existing.length + toInsert.length >= REQUIRED) break;
      if (replace && toInsert.length >= REQUIRED) break;
    }

    if (replace) {
      // Replace existing with the provided set
      await prisma.$transaction(async (tx) => {
        await tx.quizQuestion.deleteMany({ where: { subtopicId } });
        for (const q of toInsert) {
          try {
            await tx.quizQuestion.create({
              data: {
                prompt: q.prompt,
                options: q.options as unknown as any,
                answerIndex: q.answerIndex,
                explanation: q.explanation,
                subtopicId,
              },
            });
          } catch (e: any) {
            // Ignore unique conflicts that can occur under concurrent requests
            if (e?.code !== 'P2002') throw e;
          }
        }
      }, INTERACTIVE_TX_OPTIONS);
    } else {
      // Create individually so we can return IDs
      for (const q of toInsert) {
        try {
          await prisma.quizQuestion.create({
            data: {
              prompt: q.prompt,
              options: q.options as unknown as any,
              answerIndex: q.answerIndex,
              explanation: q.explanation,
              subtopicId,
            },
          });
        } catch (e: any) {
          // Ignore unique conflicts (another request saved the same prompt)
          if (e?.code !== 'P2002') throw e;
        }
      }
    }

    const final = await prisma.quizQuestion.findMany({
      where: { subtopicId },
      select: {
        id: true,
        prompt: true,
        options: true,
        answerIndex: true,
        explanation: true,
      },
    });
    return NextResponse.json({
      questions: final.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options as unknown as string[],
        answerIndex: q.answerIndex,
        explanation: q.explanation,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
