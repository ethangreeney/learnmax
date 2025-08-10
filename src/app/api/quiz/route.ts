// src/app/api/quiz/route.ts
import { NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';
import prisma from '@/lib/prisma';

type RawQ = {
  question?: string;
  prompt?: string;
  options?: unknown;
  answerIndex?: unknown;
  explain?: string;
  explanation?: string;
};

type CleanQ = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

// Allow tuning via env vars
const GEN_TIMEOUT_MS: number = Number(process.env.QUIZ_GEN_TIMEOUT_MS || '') || 20000;
const AUDIT_TIMEOUT_MS: number = Number(process.env.QUIZ_AUDIT_TIMEOUT_MS || '') || 8000;
const ALLOW_SECOND_TRY: boolean = (process.env.QUIZ_ALLOW_SECOND_TRY || '0') === '1';

// Clip helper to keep prompts bounded for latency and cost
function clip(text: string, max = 8000): string {
  const t = String(text || '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function toClean(q: RawQ): CleanQ | null {
  const prompt = String((q.prompt ?? q.question ?? '') || '').trim();
  const explanation = String((q.explanation ?? q.explain ?? '') || '').trim();
  const options = Array.isArray(q.options)
    ? q.options.map((o) => String(o ?? '').trim()).filter(Boolean)
    : [];
  const answerIndex = Number(q.answerIndex);
  if (!prompt || !explanation) return null;
  if (options.length !== 4) return null;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
  return { prompt, options, answerIndex, explanation };
}

function shuffleOptionsWithAnswer(
  options: string[],
  answerIndex: number,
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

/* ------------------------ Grounding helpers ------------------------ */

const STOP = new Set([
  'the','a','an','and','or','of','for','to','in','on','at','by','is','are','was',
  'were','be','with','as','that','this','it','its','from','into','than','then',
  'but','not','if','any','all','no','one','two','there','their','between','you',
  'can','will','have','has','had','which'
]);

function words(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []);
}
function keywords(s: string, max = 12): string[] {
  const freq = new Map<string, number>();
  for (const w of words(s)) {
    if (w.length < 4 || STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function containsNgramQuote(explanation: string, lesson: string, n = 4): boolean {
  // normalized, punctuation-free comparison
  const lw = words(lesson);
  const ew = words(explanation);
  if (lw.length < n || ew.length < n) return false;
  const eText = ew.join(' ');
  for (let i = 0; i <= lw.length - n; i++) {
    const gram = lw.slice(i, i + n).join(' ');
    if (gram.length >= 12 && eText.includes(gram)) return true;
  }
  return false;
}

function overlapCount(text: string, kws: string[]): number {
  const set = new Set(words(text));
  let c = 0;
  for (const k of kws) if (set.has(k)) c++;
  return c;
}

// -------------------------- Similarity helpers --------------------------
const SIMILARITY_THRESHOLD: number = Number(process.env.QUIZ_SIMILARITY_THRESHOLD || '') || 0.6;

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

function isPromptSimilarToAny(prompt: string, existing: string[], threshold = SIMILARITY_THRESHOLD): boolean {
  if (!prompt || !existing?.length) return false;
  const ta = significantWords(prompt);
  for (const ex of existing) {
    const tb = significantWords(ex);
    const sim = jaccardSimilarity(ta, tb);
    if (sim >= threshold) return true;
  }
  return false;
}

function isGrounded(q: CleanQ, lessonMd: string, kws: string[]): boolean {
  const text = [q.prompt, q.explanation, ...q.options].join(' ').toLowerCase();
  // Require at least one keyword match to allow more fast-path acceptances
  const hasKw = overlapCount(text, kws) >= Math.min(1, kws.length);
  const hasQuote = containsNgramQuote(q.explanation, lessonMd, 3);
  return hasKw && hasQuote;
}

function scoreCandidate(q: CleanQ, lessonMd: string, kws: string[]): number {
  const text = [q.prompt, q.explanation, ...q.options].join(' ').toLowerCase();
  const kwScore = overlapCount(text, kws);
  const quoteScore = containsNgramQuote(q.explanation, lessonMd, 3) ? 3 : 0;
  // light penalty for true/false style
  const tfPenalty = q.options.join(' ').toLowerCase().includes('true') ? 1 : 0;
  return kwScore + quoteScore - tfPenalty;
}

/* -------------------- Single-correctness auditor (LLM) -------------------- */
async function hasExactlyOneCorrect(
  q: CleanQ,
  lessonMd: string,
  model: string,
): Promise<boolean> {
  const auditPrompt = `You are auditing a multiple-choice question for strict single-correctness.

Using ONLY the LESSON below, determine which options are strictly and unambiguously correct.

Return ONLY JSON:
{ "correctIndices": number[] }

Rules:
- Consider an option correct only if it is explicitly supported by the LESSON.
- If two options could both be correct, include both; do not force a single choice.
- If none is correct, return an empty array.

---
LESSON:
${lessonMd}
---
QUESTION:
${q.prompt}
OPTIONS (0-based):
${JSON.stringify(q.options, null, 2)}
`;
  const withTimeout = <T,>(p: Promise<T>, ms = 4000): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
  try {
    const res = await withTimeout(generateJSON(auditPrompt, model), AUDIT_TIMEOUT_MS);
    const arr = Array.isArray(res?.correctIndices)
      ? res.correctIndices
          .map((n: any) => Number(n))
          .filter((n: any) => Number.isInteger(n) && n >= 0 && n < q.options.length)
      : [];
    if (arr.length !== 1) return false;
    return arr[0] === q.answerIndex;
  } catch {
    return false;
  }
}

/* Deterministic fallback: builds a grounded T/F MCQ from the lesson text */
function pickDeclarativeSentence(md: string): string | null {
  // Split on sentence-ish boundaries and pick something medium length
  const pieces = (md.replace(/\s+/g, ' ').trim().match(/[^.?!]+[.?!]/g) || [])
    .map(s => s.trim());
  const candidates = pieces.filter(s => {
    const wc = words(s).length;
    return wc >= 8 && wc <= 24 && !/:$/.test(s);
  });
  return candidates[0] || pieces[0] || null;
}
// Fallback completely disabled for quality: if no acceptable question, return 422

/* ------------------------------ Route ------------------------------ */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const t0 = Date.now();
    const preferredModel =
      typeof (body as any)?.model === 'string' && (body as any).model.trim()
        ? ((body as any).model as string).trim()
        : undefined;
    const modelForQuiz = preferredModel || 'gemini-2.5-flash';
    let lessonMd = String(body?.lessonMd || '').trim();
    const subtopicTitle = String(body?.subtopicTitle || '').trim();
    const lectureId = String((body as any)?.lectureId || '').trim();
    const overview = String((body as any)?.overview || '').trim();
    const difficulty = String(body?.difficulty || 'hard').toLowerCase();
    const subtopicId = String((body as any)?.subtopicId || '').trim();
    const avoidPromptsFromClient: string[] = Array.isArray((body as any)?.avoidPrompts)
      ? ((body as any).avoidPrompts as string[]).map((s) => String(s || '').trim()).filter(Boolean)
      : [];

    // If lesson is short, try to augment from server-side stored original content using lectureId
    if (lessonMd.length < 50 && lectureId) {
      try {
        const lec = await prisma.lecture.findUnique({ where: { id: lectureId }, select: { originalContent: true } });
        const original = String(lec?.originalContent || '').trim();
        const composite = [overview, lessonMd, original].filter(Boolean).join('\n\n');
        if (composite.length >= 50) lessonMd = composite;
      } catch {}
    }
    if (lessonMd.length < 50) {
      return NextResponse.json({ error: 'lessonMd (≥50 chars) is required' }, { status: 400 });
    }

    const kws = keywords(lessonMd, 12);
    const kwHint = kws.length ? `Use the lesson’s domain. Keywords you should naturally touch: ${kws.slice(0, 8).join(', ')}.` : '';

    // Collect existing prompts to encourage diversity
    let existingPrompts: string[] = [];
    if (subtopicId) {
      try {
        const existing = await prisma.quizQuestion.findMany({ where: { subtopicId }, select: { prompt: true } });
        existingPrompts.push(
          ...existing.map((q) => String(q?.prompt || '').trim()).filter(Boolean),
        );
      } catch {}
    }
    if (avoidPromptsFromClient.length) existingPrompts.push(...avoidPromptsFromClient);
    existingPrompts = Array.from(new Set(existingPrompts.filter(Boolean)));
    const existingSection = existingPrompts.length
      ? `EXISTING QUESTIONS (avoid repeating their topics/wording):\n${existingPrompts
          .slice(0, 8)
          .map((p, i) => `${i + 1}. ${p}`)
          .join('\n')}\n`
      : '';

    const rigor =
      difficulty === 'hard'
        ? 'Make it application-level with a subtle trap for superficial readers.'
        : 'Keep it focused and fair, not trivial.';

    const basePrompt = `
You are an exacting exam writer. Using ONLY the LESSON MARKDOWN below, write exactly ONE multiple-choice question ${subtopicTitle ? `that specifically tests the subtopic "${subtopicTitle}".` : 'about its core idea.'}

Return ONE JSON object in this shape:
{
  "questions": [
    { "prompt": "string", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "string" }
  ]
}

Rules:
- ${rigor}
- ${kwHint}
- In the explanation, include a short DIRECT quote (6–12 words) from the lesson, in "double quotes". The quote must be verbatim and not generic filler.
- Do NOT invent facts not supported by the lesson.
- Do NOT prefix options with letters or numbers.
- Exactly four options. Correct answer index must be 0..3.
- Exactly ONE option must be correct; the other three must be clearly incorrect given the LESSON.
- Avoid ambiguous, overlapping, or "All/None of the above" answers.
- Prefer conceptual or applied questions over trivial factual restatement.
 - If the section "EXISTING QUESTIONS" appears below, your question must be meaningfully different in both topic and wording. Choose a different mechanism, constraint, cause/effect, or scenario than any listed.
 - Vary the question style relative to existing ones (e.g., application scenario, diagnose an error, compare/contrast, cause-and-effect, ordering/steps).

Context hints to avoid triviality:
- Do not ask "is this sentence true" questions.
- Avoid simply echoing a single sentence; synthesize across two or more details where possible.

---
${existingSection}
LESSON MARKDOWN (truncated):
${clip(lessonMd, 4500)}
---`.trim();

    const withTimeout = <T,>(p: Promise<T>, ms = GEN_TIMEOUT_MS): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ]);

    // First attempt (with timeout)
    let attempt1Ms = 0; let timedOut1 = false;
    let json: any = {};
    try {
      const a0 = Date.now();
      json = await withTimeout(generateJSON(basePrompt, modelForQuiz));
      attempt1Ms = Date.now() - a0;
    } catch (e: any) {
      attempt1Ms = attempt1Ms || 0;
      timedOut1 = String(e?.message || '').toLowerCase().includes('timeout');
      json = {} as any;
    }
    let raw = Array.isArray(json?.questions) ? json.questions : [];
    let cleaned = raw.map(toClean).filter(Boolean) as CleanQ[];
    if (existingPrompts.length && cleaned.length) {
      cleaned = cleaned.filter((q) => !isPromptSimilarToAny(q.prompt, existingPrompts));
    }
    const cleaned1 = cleaned.slice();
    const initiallyGrounded = cleaned.filter((q) => isGrounded(q, lessonMd, kws));

    // Fast path: if we have at least one grounded candidate, accept the best-scoring one without LLM audit
    if (initiallyGrounded.length) {
      const best = initiallyGrounded
        .slice()
        .sort((a, b) => scoreCandidate(b, lessonMd, kws) - scoreCandidate(a, lessonMd, kws))[0]!;
      const shFast = shuffleOptionsWithAnswer(best.options, best.answerIndex);
      const outFast = { ...best, options: shFast.options, answerIndex: shFast.answerIndex };
      return NextResponse.json({
        questions: [outFast],
        debug: {
          model: modelForQuiz,
          ms: Date.now() - t0,
          accepted: 'fast',
          attempt1Ms,
          timedOut1,
          cleaned1: cleaned1.length,
          grounded1: initiallyGrounded.length,
          existing: existingPrompts.length,
        },
      });
    }

    // Try auditing the first attempt's cleaned candidates before doing a second LLM try
    let auditMs = 0;
    let grounded: CleanQ[] = [];
    if (cleaned1.length) {
      const auditStart1 = Date.now();
      const results1 = await Promise.allSettled(
        cleaned1.map((q) => hasExactlyOneCorrect(q, lessonMd, modelForQuiz)),
      );
      auditMs += Date.now() - auditStart1;
      const audited1 = cleaned1.filter((_, i) => results1[i].status === 'fulfilled' && (results1[i] as PromiseFulfilledResult<boolean>).value);
      if (audited1.length) {
        const q0 = audited1[0];
        const sh = shuffleOptionsWithAnswer(q0.options, q0.answerIndex);
        const outQ = { ...q0, options: sh.options, answerIndex: sh.answerIndex };
        return NextResponse.json({ questions: [outQ], debug: { model: modelForQuiz, ms: Date.now() - t0, auditMs, accepted: 'audited1', attempt1Ms, timedOut1, cleaned1: cleaned1.length, grounded1: initiallyGrounded.length, existing: existingPrompts.length } });
      }
    }

    // Retry if nothing passed audit (optional, controlled by env)
    if (!grounded.length && ALLOW_SECOND_TRY) {
      const retryPrompt = `
Your previous attempt was rejected for not being grounded in the LESSON.
Try again and follow these STRICT requirements:

- The question and explanation MUST be consistent with the LESSON only.
- Include at least TWO of these keywords in the prompt or explanation: ${kws.join(', ')}.
- In the explanation, include one exact quote (6–12 words) from the LESSON in "double quotes". The quote must be verbatim.
 - Exactly ONE option must be correct; ensure the other three are unambiguously incorrect.
 - Do NOT use "All of the above" or "None of the above".
 - Do NOT produce a boolean true/false wrapper around a copied sentence.
 - Prefer a question that requires understanding a relationship, mechanism, or constraint stated in the lesson.
 - Your question must be clearly different in topic AND wording from these existing ones (if any):\n${existingPrompts.slice(0, 8).map((p, i) => `${i + 1}. ${p}`).join('\n')}

Return ONLY the same JSON shape as before.

      ---
      LESSON MARKDOWN (truncated):
      ${clip(lessonMd, 8000)}
      ---`.trim();

      let attempt2Ms = 0; let timedOut2 = false;
      try {
        const b0 = Date.now();
        json = await withTimeout(generateJSON(retryPrompt, modelForQuiz));
        attempt2Ms = Date.now() - b0;
      } catch (e: any) {
        attempt2Ms = attempt2Ms || 0;
        timedOut2 = String(e?.message || '').toLowerCase().includes('timeout');
        json = {} as any;
      }
      raw = Array.isArray(json?.questions) ? json.questions : [];
      cleaned = raw.map(toClean).filter(Boolean) as CleanQ[];
      if (existingPrompts.length && cleaned.length) {
        cleaned = cleaned.filter((q) => !isPromptSimilarToAny(q.prompt, existingPrompts));
      }
      const cleaned2 = cleaned.slice();
      const groundedRetry = cleaned.filter((q) => isGrounded(q, lessonMd, kws));
      if (groundedRetry.length) {
        const auditStart2 = Date.now();
        const results2 = await Promise.allSettled(
          groundedRetry.map((q) => hasExactlyOneCorrect(q, lessonMd, modelForQuiz)),
        );
        auditMs += Date.now() - auditStart2;
        const auditedRetry = groundedRetry.filter((_, i) => results2[i].status === 'fulfilled' && (results2[i] as PromiseFulfilledResult<boolean>).value);
        grounded = auditedRetry.length ? auditedRetry : [];
      } else {
        grounded = [];
      }
      const msTotal = Date.now() - t0;
      if (!grounded.length) {
        return NextResponse.json({ error: 'no_acceptable_question', debug: { model: modelForQuiz, ms: msTotal, auditMs, attempt1Ms, attempt2Ms, timedOut1, timedOut2, cleaned1: cleaned1.length, grounded1: initiallyGrounded.length, cleaned2: cleaned2.length, grounded2: groundedRetry.length, secondTry: true } }, { status: 422 });
      }
    }

    // Decide acceptance path and return
    if (!grounded.length) {
      return NextResponse.json({ error: 'no_acceptable_question', debug: { model: modelForQuiz, ms: Date.now() - t0, auditMs, attempt1Ms, timedOut1, cleaned1: cleaned.length, grounded1: initiallyGrounded.length, secondTry: false } }, { status: 422 });
    }

    // Keep just one good question (already audited) and shuffle options
    const acceptPath = 'audited';
    const q0 = grounded[0];
    const sh = shuffleOptionsWithAnswer(q0.options, q0.answerIndex);
    const outQ = { ...q0, options: sh.options, answerIndex: sh.answerIndex };
    return NextResponse.json({ questions: [outQ], debug: { model: modelForQuiz, ms: Date.now() - t0, auditMs, accepted: acceptPath, attempt1Ms, timedOut1, cleaned1: cleaned?.length || 0, grounded1: initiallyGrounded?.length || 0, existing: existingPrompts.length } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'quiz failed' }, { status: 500 });
  }
}
