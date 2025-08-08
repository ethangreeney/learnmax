// src/app/api/quiz/route.ts
import { NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';

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
    if (gram.length >= 18 && eText.includes(gram)) return true;
  }
  return false;
}

function overlapCount(text: string, kws: string[]): number {
  const set = new Set(words(text));
  let c = 0;
  for (const k of kws) if (set.has(k)) c++;
  return c;
}

function isGrounded(q: CleanQ, lessonMd: string, kws: string[]): boolean {
  const text = [q.prompt, q.explanation, ...q.options].join(' ').toLowerCase();
  const hasKw = overlapCount(text, kws) >= Math.min(2, kws.length); // at least 2 keywords
  const hasQuote = containsNgramQuote(q.explanation, lessonMd, 4);
  return hasKw && hasQuote;
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
function fallbackFromLesson(lessonMd: string): CleanQ {
  const s = pickDeclarativeSentence(lessonMd) || 'A tree has exactly one unique path between any two distinct vertices.';
  return {
    prompt: `According to the lesson, is the following statement true?\n\n“${s}”`,
    options: ['True', 'False', 'Not stated', 'Only in a special case'],
    answerIndex: 0,
    explanation: `This sentence appears in (or is directly implied by) the lesson: “${s}”.`,
  };
}

/* ------------------------------ Route ------------------------------ */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const lessonMd = String(body?.lessonMd || '').trim();
    const subtopicTitle = String(body?.subtopicTitle || '').trim();
    const difficulty = String(body?.difficulty || 'hard').toLowerCase();

    if (lessonMd.length < 50) {
      return NextResponse.json({ error: 'lessonMd (≥50 chars) is required' }, { status: 400 });
    }

    const kws = keywords(lessonMd, 12);
    const kwHint = kws.length ? `Use the lesson’s domain. Keywords you should naturally touch: ${kws.slice(0, 8).join(', ')}.` : '';

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
- The explanation MUST include a short DIRECT quote (6–12 words) from the lesson, in "double quotes".
- Do NOT invent facts not supported by the lesson.
- Do NOT prefix options with letters or numbers.
- Exactly four options. Correct answer index must be 0..3.

---
LESSON MARKDOWN:
${lessonMd}
---`.trim();

    // First attempt
    let json = await generateJSON(basePrompt);
    let raw = Array.isArray(json?.questions) ? json.questions : [];
    let cleaned = raw.map(toClean).filter(Boolean) as CleanQ[];
    let grounded = cleaned.filter((q) => isGrounded(q, lessonMd, kws));

    // Retry if nothing passed audit
    if (!grounded.length) {
      const retryPrompt = `
Your previous attempt was rejected for not being grounded in the LESSON.
Try again and follow these STRICT requirements:

- The question and explanation MUST be consistent with the LESSON only.
- Include at least TWO of these keywords in the prompt or explanation: ${kws.join(', ')}.
- In the explanation, include one exact quote (6–12 words) from the LESSON in "double quotes". The quote must be verbatim.

Return ONLY the same JSON shape as before.

---
LESSON MARKDOWN:
${lessonMd}
---`.trim();

      json = await generateJSON(retryPrompt);
      raw = Array.isArray(json?.questions) ? json.questions : [];
      cleaned = raw.map(toClean).filter(Boolean) as CleanQ[];
      grounded = cleaned.filter((q) => isGrounded(q, lessonMd, kws));
    }

    // Final fallback — guaranteed grounded
    if (!grounded.length) {
      const fb = fallbackFromLesson(lessonMd);
      return NextResponse.json({ questions: [fb] });
    }

    // Keep just one good question
    return NextResponse.json({ questions: [grounded[0]] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'quiz failed' }, { status: 500 });
  }
}
