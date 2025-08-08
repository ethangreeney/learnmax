'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatPanel from '@/components/ChatPanel';
import {
  deriveUnlockedIndex,
  type LearnLecture,
  type QuizQuestion,
} from '@/lib/shared/learn-types';
import { createLearnUIStore } from '@/lib/client/learn-ui-store';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';

/** Normalize model output so it never renders as one giant code block. */
function sanitizeMarkdown(md: string): string {
  if (!md) return md;
  let t = md.trim();

  // 1) Unwrap a single full-document fenced block (```md / ```markdown / ``` / any)
  const exactFence = t.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
  if (exactFence) {
    t = exactFence[1].trim();
  } else {
    const anyFence = t.match(/^```([A-Za-z0-9+_.-]*)\s*\n([\s\S]*?)\n```$/);
    if (anyFence) {
      const lang = (anyFence[1] || '').toLowerCase();
      const inner = anyFence[2];
      if (
        lang === '' ||
        lang === 'markdown' ||
        lang === 'md' ||
        /^(#{1,6}\s|[-*]\s|\d+\.\s)/m.test(inner) ||
        /\n\n/.test(inner)
      ) {
        t = inner.trim();
      }
    }
  }

  // 2) If every non-empty line starts with >=4 spaces or a tab, de-indent once (was treated as code)
  const lines = t.split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length && nonEmpty.every((l) => /^ {4,}|\t/.test(l))) {
    t = lines.map((l) => l.replace(/^ {4}/, '')).join('\n').trim();
  }

  // 3) If there is a stray unmatched ``` fence, strip it.
  const tickCount = (t.match(/```/g) || []).length;
  if (tickCount === 1) {
    t = t.replace(/```/g, '');
  }

  return t;
}

export default function LearnView({ initial }: { initial: LearnLecture }) {
  // UI-only store per page mount
  const initialUnlocked = deriveUnlockedIndex(initial.subtopics);
  const storeRef = useRef(
    createLearnUIStore({
      currentIndex: initialUnlocked,
      unlockedIndex: initialUnlocked,
    })
  );
  const ui = storeRef.current;

  const currentIndex = ui((s) => s.currentIndex);
  const unlockedIndex = ui((s) => s.unlockedIndex);
  const currentSubtopic = initial.subtopics[currentIndex];

  // Scroll to top of main panel on subtopic change
  const mainRef = useRef<HTMLElement | null>(null);
  const scrollToMainTop = () => {
    if (typeof window === 'undefined') return;
    if (mainRef.current) {
      mainRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Title (display-only; rename happens in Dashboard)
  const title = initial.title;
  const router = useRouter();
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);

  // Explanations cache (sanitized)
  const [explanations, setExplanations] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial.subtopics.map((s) => [s.id, s.explanation ? sanitizeMarkdown(s.explanation) : ''])
    )
  );

  // Progress state (green progress bar in left sidebar)
  const initialMastered = initial.subtopics.filter((s) => s.mastered).length;
  const totalCount = initial.subtopics.length;
  const [masteredCount, setMasteredCount] = useState<number>(initialMastered);
// NEW: track which subtopics are already counted to avoid double-increment
const countedIdsRef = useRef<Set<string>>(
  new Set(initial.subtopics.filter(s => s.mastered).map(s => s.id))
);

  const progressPct = Math.round((masteredCount / Math.max(1, totalCount)) * 100);
  const progressPctSafe = isCompleted ? 100 : progressPct;

  const canSelect = (i: number) => i <= unlockedIndex;

  // Keep unlockedIndex sane if server state changes
  useEffect(() => {
    const u = deriveUnlockedIndex(initial.subtopics);
    ui.setState((s) => ({
      ...s,
      unlockedIndex: Math.max(u, s.unlockedIndex),
      currentIndex: Math.max(0, Math.min(s.currentIndex, initial.subtopics.length - 1)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.subtopics.map((s) => (s as any).mastered).join('|')]);

  const fetchExplanation = useCallback(
    async (style: 'default' | 'simplified' | 'detailed' | 'example' = 'default') => {
      const s = currentSubtopic;
      if (!s) return;
      setExplanations((e) => ({ ...e, [s.id]: 'Crafting learning module...' }));
      try {
        let model: string | undefined;
        try { model = localStorage.getItem('ai:model') || undefined; } catch {}
        // Our API expects lectureTitle + subtopic and returns { markdown }
        const res = await fetch('/api/explain-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lectureTitle: title || initial.title,
            subtopic: s.title,
            model,
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { markdown?: string };
        const md = sanitizeMarkdown(data.markdown || '');
        setExplanations((e) => ({ ...e, [s.id]: md || 'No content generated.' }));
      } catch (e: any) {
        setExplanations((ex) => ({ ...ex, [s.id]: 'Could not generate explanation. ' + (e?.message || '') }));
      }
    },
    [currentSubtopic, title, initial.title]
  );

  // On subtopic change: fetch explanation once and scroll to top
  useEffect(() => {
    const s = currentSubtopic;
    if (s && !explanations[s.id]) {
      fetchExplanation('default');
    }
    if (s) {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => scrollToMainTop());
      } else {
        scrollToMainTop();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubtopic?.id]);

  // rename removed from lesson page

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 px-2 md:px-4">
      {/* Left: Outline */}
      <aside className="space-y-5 self-start rounded-lg border border-neutral-800 p-6 lg:p-7 xl:p-8 lg:col-span-3">
        <h2 className="text-xl font-semibold">Lecture</h2>

        {/* Progress bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
            <span>Progress</span>
            <span>
              {masteredCount}/{totalCount} ({progressPctSafe}%)
            </span>
          </div>

          {/* Bar + non-clipped glow */}
          <div className="relative">
            <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-green-600 rounded-full transition-[width] duration-500"
                style={{ width: `${progressPctSafe}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 z-20"
              style={{ width: `${progressPctSafe}%` }}
            >
              <div className="h-4 w-full rounded-full blur-[10px] bg-green-400/40 mix-blend-screen" />
            </div>
          </div>
        </div>

        {/* Title is managed on the Dashboard now */}

        <div className="mt-4 mb-2">
          <div className="text-sm text-neutral-400 uppercase">Title</div>
          <div className="text-lg font-semibold">{title}</div>
        </div>

        <ul className="space-y-1">
          {initial.subtopics.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => canSelect(i) && ui.setState({ currentIndex: i })}
                disabled={!canSelect(i)}
                className={`w-full rounded-md px-4 py-3.5 text-left text-sm leading-snug transition-colors ${
                  i > unlockedIndex
                    ? 'text-neutral-600'
                    : i === currentIndex
                      ? 'bg-neutral-800 font-semibold text-white'
                      : 'text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Center: Explanation + Quiz */}
      <main ref={mainRef} className="lg:col-span-6">
        {currentSubtopic ? (
          <div className="space-y-8">
            <div className="card p-6 md:p-8 xl:p-10">
              <h3 className="text-3xl font-bold tracking-tight">{currentSubtopic.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-400">
                <span>Importance: {currentSubtopic.importance}</span> <span>•</span>{' '}
                <span>Difficulty: {currentSubtopic.difficulty}</span>
              </div>
              <div className="mt-6 flex items-center gap-2 border-t border-neutral-800/50 pt-4">
                <span className="text-sm font-medium text-neutral-400">Style:</span>
                <button
                  onClick={() => fetchExplanation('default')}
                  className="rounded-md bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
                >
                  Default
                </button>
                <button
                  onClick={() => fetchExplanation('simplified')}
                  className="rounded-md bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
                >
                  Simplified
                </button>
                <button
                  onClick={() => fetchExplanation('detailed')}
                  className="rounded-md bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
                >
                  Detailed
                </button>
                <button
                  onClick={() => fetchExplanation('example')}
                  className="rounded-md bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
                >
                  Example
                </button>
              </div>
              <hr className="my-6 border-neutral-800" />
              <div id="lesson-markdown" data-lesson="markdown" className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {explanations[currentSubtopic.id] || 'Crafting learning module...'}
                </ReactMarkdown>
              </div>
            </div>

            <div className="quiz-panel card p-6 md:p-8 xl:p-10">
              <h3 className="mb-6 text-2xl font-bold tracking-tight">Mastery Check</h3>
              <QuizPanel
                key={currentSubtopic.id}
                subtopicId={currentSubtopic.id}
                subtopicTitle={currentSubtopic.title}
                hasLesson={Boolean((explanations[currentSubtopic.id] || '').trim().length >= 50)}
                lessonMd={(explanations[currentSubtopic.id] || '').trim()}
                questions={currentSubtopic.questions}
                onPassed={async () => {
  const id = currentSubtopic.id;
  if (!countedIdsRef.current.has(id)) {
    countedIdsRef.current.add(id);
    setMasteredCount((m) => Math.min(totalCount, m + 1));
  }

                  /* END-OF-LECTURE */
                  const isLast = currentIndex === initial.subtopics.length - 1;
                  // Persist mastery in background (non-blocking)
                  try { void fetch('/api/mastery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subtopicId: currentSubtopic.id }),
                  }); } catch {}

                  if (isLast) {
                    setIsCompleted(true);
                    setShowSparkle(true);
                    setTimeout(() => setShowSparkle(false), 1200);
                    // Let the bar finish animating, then go to completion screen
                    setTimeout(() => {
                      try { router.push(`/learn/${initial.id}/complete`); } catch {}
                    }, 900);
                    return;
                  }
                  // Optimistic advance
                  const idx = currentIndex;
                  const next = Math.min(idx + 1, initial.subtopics.length - 1);
                  ui.setState({
                    currentIndex: next,
                    unlockedIndex: Math.max(unlockedIndex, next),
                  });
                  scrollToMainTop();
                  // No duplicate await; background call above
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[60vh] items-center justify-center rounded-lg border-2 border-dashed border-neutral-800 text-neutral-500">
            <p>Select a subtopic to begin</p>
          </div>
        )}
      </main>

      {/* Right: AI Tutor */}
      <aside className="sticky top-24 h-[calc(100vh-8rem)] self-start lg:col-span-3">
        <ChatPanel documentContent={initial.originalContent} />
      </aside>
    </div>
  );
}

/* ------------------------------ QuizPanel --------------------------------- */

function QuizPanel({
  subtopicId,
  subtopicTitle,
  hasLesson,
  lessonMd,
  questions,
  onPassed,
}: {
  subtopicId: string;
  subtopicTitle: string;
  hasLesson: boolean;
  lessonMd?: string;
  questions: QuizQuestion[];
  onPassed: () => void;
}) {
  const stripABCD = (str: string) =>
    (str ?? '').replace(/^\s*[A-Da-d]\s*[.)-:]\s*/, '').trim();

  const [items, setItems] = useState<QuizQuestion[]>(() => questions || []);
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loadingAnother, setLoadingAnother] = useState(false);
  const [hardLoaded, setHardLoaded] = useState(false);

  // Reset when subtopic questions change
  useEffect(() => {
    setItems(questions || []);
    setAnswers([]);
    setRevealed(false);
    setHardLoaded(false);
  }, [questions.map((q) => q.id).join('|')]);

  const setAns = (qIndex: number, ansIndex: number) => {
    const next = [...answers];
    next[qIndex] = ansIndex;
    setAnswers(next);
  };

  const allCorrect =
    items && items.length > 0 && items.every((q, i) => answers[i] === q.answerIndex);

  const check = () => setRevealed(true);
  const tryAgain = () => setRevealed(false);

  // Once lesson content exists, fetch a harder question that uses it.
  useEffect(() => {
    if (!hasLesson || hardLoaded) return;
    const payload = (lessonMd || '').trim();
    if (payload.length < 50) return;

    (async () => {
      try {
        const res = await fetch('/api/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonMd: payload, difficulty: 'hard', subtopicTitle }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = (await res.json()) as {
          questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }>;
        };
        const q = data.questions?.[0];
        if (!q) return;
        const newQ: QuizQuestion = {
          id:
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? (crypto as any).randomUUID()
              : `q-${Date.now()}`,
          prompt: q.prompt,
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
        };
        setItems([newQ]);
        setAnswers([]);
        setRevealed(false);
        setHardLoaded(true);
      } catch {
        // Keep seed question if API fails
      }
    })();
  }, [hasLesson, lessonMd, hardLoaded]);

  const askAnother = async () => {
    setLoadingAnother(true);
    try {
      const payload = (lessonMd || '').trim();
      if (payload.length < 50) throw new Error('lesson too short');
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonMd: payload, difficulty: 'hard', subtopicTitle }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }>;
      };
      const q = data.questions?.[0];
      if (!q) throw new Error('No question returned');
      const newQ: QuizQuestion = {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? (crypto as any).randomUUID()
            : `q-${Date.now()}`,
        prompt: q.prompt,
        options: q.options,
        answerIndex: q.answerIndex,
        explanation: q.explanation,
      };
      setItems([newQ]);
      setAnswers([]);
      setRevealed(false);
    } catch (_e) {
      // Fallback: rotate options of the first question
      if (items && items.length > 0) {
        const base = items[0];
        const rotated = [...base.options];
        rotated.push(rotated.shift() as string);
        const newAnswer = (base.answerIndex - 1 + rotated.length) % rotated.length;
        setItems([
          {
            ...base,
            id: `${base.id}-v${Date.now()}`,
            prompt: `${base.prompt} (Variant)`,
            options: rotated,
            answerIndex: newAnswer,
            explanation: base.explanation,
          },
        ]);
        setAnswers([]);
        setRevealed(false);
      }
    } finally {
      setLoadingAnother(false);
    }
  };
  if (hasLesson && !hardLoaded) {
    return <p className="text-sm text-neutral-400">Generating a question from the lesson…</p>;
  }


  if (!items || items.length === 0) {
    return <p className="text-sm text-neutral-400">No quiz questions for this subtopic.</p>;
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-6">
        {items.map((q, i) => {
          const selected = answers[i];
          const isAllCorrect = allCorrect;
          return (
            <li key={q.id} className="space-y-3">
              <div className="font-medium text-neutral-200">{q.prompt}</div>
              <div className="grid gap-2">
                {q.options.map((o, j) => {
                  const isSelected = selected === j;
                  const isCorrect = revealed && j === q.answerIndex;
                  const isIncorrect = revealed && isSelected && j !== q.answerIndex;
                  const buttonClass = `rounded-md border p-3 text-left transition-all text-sm ${
                    isCorrect
                      ? 'border-green-500 bg-green-900/30'
                      : isIncorrect
                        ? 'border-red-500 bg-red-900/30'
                        : isSelected
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-neutral-700 hover:bg-neutral-800'
                  }`;
                  return (
                    <button
                      key={j}
                      onClick={() => setAns(i, j)}
                      className={buttonClass}
                      disabled={revealed && isAllCorrect}
                    >
                      {stripABCD(o)}
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <div className="mt-4 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                  {q.explanation}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-4 pt-4">
        {!revealed && (
          <button
            onClick={check}
            disabled={items.length === 0}
            className="rounded-md bg-white px-5 py-2 font-semibold text-black disabled:opacity-50"
          >
            Check Answer
          </button>
        )}

        {revealed && allCorrect && (
          <>
            <button
              onClick={askAnother}
              disabled={loadingAnother}
              className="rounded-md border border-neutral-600 px-4 py-2 text-sm hover:bg-neutral-900 disabled:opacity-50"
            >
              {loadingAnother ? 'Generating…' : 'Ask me another question'}
            </button>
            <button
              onClick={onPassed}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
            >
              Go to next subtopic
            </button>
          </>
        )}
      </div>
    </div>
  );
}
