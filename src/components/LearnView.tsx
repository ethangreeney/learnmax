'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ChatPanel from '@/components/ChatPanel';
import {
  deriveUnlockedIndex,
  type LearnLecture,
  type QuizQuestion,
  type LearnSubtopic,
} from '@/lib/shared/learn-types';
import { createLearnUIStore } from '@/lib/client/learn-ui-store';
// import useBodyScrollLock from '@/hooks/useBodyScrollLock';

/** Normalize model output so it never renders as one giant code block. */
function sanitizeMarkdown(md: string): string {
  if (!md) return md;
  // Do NOT trim here. Trimming breaks streaming by removing leading spaces
  // that can arrive at chunk boundaries, causing words to concatenate.
  let t = md;

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

// Merge streaming chunks without gluing words together across boundaries.
function appendChunkSafely(previous: string, next: string): string {
  if (!next) return previous || '';
  if (!previous) return next;
  const lastChar = previous.slice(-1);
  const firstChar = next[0];
  const isWordChar = (ch: string) => /[A-Za-z0-9]/.test(ch);
  const needsSpace = (
    // word + word (e.g., "feathers" + "While")
    (isWordChar(lastChar) && isWordChar(firstChar)) ||
    // sentence/colon punctuation followed by a word with no whitespace
    (/[\.:;!?]$/.test(previous) && isWordChar(firstChar))
  ) && !/^\s/.test(next);
  return needsSpace ? previous + ' ' + next : previous + next;
}

// Ensure rendered content never starts with a title/heading
function stripLeadingTitle(md: string, title?: string): string {
  let out = String(md ?? '');
  // Drop leading ATX headings (# .. ###### ..)
  out = out.replace(/^\s{0,3}#{1,6}\s+[^\n]+\n+/m, '');
  // Drop leading setext headings (Title\n==== or ----)
  out = out.replace(/^\s*([^\n]+)\n(?:=+|-+)\s*\n+/m, '');
  // If first non-empty line equals provided title, remove it
  if (title) {
    const lines = out.split('\n');
    const firstIdx = lines.findIndex((l) => l.trim() !== '');
    if (firstIdx !== -1) {
      const firstLine = lines[firstIdx].trim();
      if (firstLine.localeCompare(title.trim(), undefined, { sensitivity: 'accent' }) === 0) {
        lines.splice(firstIdx, 1);
        if (lines[firstIdx] !== undefined && lines[firstIdx].trim() === '') {
          lines.splice(firstIdx, 1);
        }
        out = lines.join('\n');
      }
    }
  }
  return out;
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

  // Title (display; updated live from streaming endpoint)
  const [title, setTitle] = useState(initial.title);
  const router = useRouter();
  const [isCompleted, setIsCompleted] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Maintain a reactive questions map keyed by subtopicId so UI updates immediately
  const [questionsById, setQuestionsById] = useState<Record<string, QuizQuestion[]>>(
    () => Object.fromEntries(initial.subtopics.map((s) => [s.id, s.questions || []]))
  );

  // Prevent duplicate quiz generation across preloader and panel
  const questionsInFlightRef = useRef<Set<string>>(new Set());
  const reserveQuestions = useCallback((id: string): boolean => {
    const s = questionsInFlightRef.current;
    if (s.has(id)) return false;
    s.add(id);
    return true;
  }, []);

  // If subtopics stream in and the second one becomes available AFTER mount while
  // we are still on the first, prefetch is deferred to the subtopic-change effect
  // so it can run in parallel with current quiz generation.

  // Track which subtopics have been prefetched to avoid missing/duplicate work
  const prefetchedNextRef = useRef<Set<string>>(new Set());
  const releaseQuestions = useCallback((id: string): void => {
    questionsInFlightRef.current.delete(id);
  }, []);

  // Force-correct first subtopic explanation once on mount to avoid any
  // potential mismatch showing the second subtopic's content.
  const forceFirstFixRef = useRef<boolean>(false);

  // Explanations cache (sanitized)
  const [explanations, setExplanations] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial.subtopics.map((s) => [s.id, s.explanation ? sanitizeMarkdown(s.explanation) : ''])
    )
  );
  // Track when a subtopic's explanation is fully generated
  const [explanationDone, setExplanationDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initial.subtopics.map((s) => [s.id, Boolean(s.explanation && s.explanation.length > 0)]))
  );

  // On first mount, if there are no subtopics yet, stream them in progressively
  useEffect(() => {
    if (!initial.subtopics || initial.subtopics.length === 0) {
      (async () => {
        try {
          setStreaming(true);
          let model: string | undefined;
          try { model = localStorage.getItem('ai:model') || undefined; } catch {}
          const qs = new URLSearchParams({ lectureId: initial.id, ...(model ? { model } : {}) });
          const res = await fetch('/api/lectures/stream?' + qs.toString());
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
            while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const event = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 2);
              if (!event.startsWith('data:')) continue;
              const json = event.slice(5).trim();
              let payload: any; try { payload = JSON.parse(json); } catch { continue; }
              if (payload?.type === 'subtopic' && payload.subtopic) {
                const s = payload.subtopic as any;
                // append into our local initial.subtopics clone
                (initial.subtopics as any).push({
                  id: s.id,
                  order: s.order,
                  title: s.title,
                  importance: s.importance,
                  difficulty: s.difficulty,
                  overview: s.overview || '',
                  explanation: s.explanation || '',
                  mastered: false,
                  questions: [],
                });
                // Keep unlocked to currentIndex
                ui.setState((st) => ({ ...st, currentIndex: st.currentIndex, unlockedIndex: Math.max(st.unlockedIndex, st.currentIndex) }));
                setExplanations((e) => ({ ...e, [s.id]: (s.explanation || '') }));
              } else if (payload?.type === 'title' && typeof payload.title === 'string') {
                setTitle(String(payload.title));
              } else if (payload?.type === 'done') {
                // finished initial stream
              } else if (payload?.type === 'error') {
                // swallow
              }
            }
          }
        } finally {
          setStreaming(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const fetchExplanationFor = useCallback(
    async (
      target: LearnSubtopic | null | undefined,
      style: 'default' | 'simplified' | 'detailed' | 'example' = 'default',
    ) => {
      if (!target) return;
      const targetId = target.id;
      const targetTitle = target.title;
      // Guard: only stream for the ACTIVE subtopic being viewed.
      try {
        const activeIndex = (ui as any)?.getState?.().currentIndex ?? currentIndex;
        const activeId = initial.subtopics[activeIndex]?.id;
        if (activeId !== targetId) {
          return;
        }
      } catch {}
      setExplanations((e) => ({ ...e, [targetId]: '' }));
      try {
        let model: string | undefined;
        try { model = localStorage.getItem('ai:model') || undefined; } catch {}
        const targetIndex = Math.max(0, initial.subtopics.findIndex((st) => st.id === targetId));
        const covered = targetIndex > 0
          ? initial.subtopics.slice(0, targetIndex).map((st) => ({ title: st.title, overview: st.overview }))
          : [];
        const qs = new URLSearchParams({ stream: '1' });
        const res = await fetch('/api/explain-db?' + qs.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lectureTitle: title || initial.title,
            subtopic: targetTitle,
            subtopicId: targetId,
            lectureId: initial.id,
            documentContent: initial.originalContent,
            covered,
            model,
            style,
          }),
        });
        if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 2);
            if (!event.startsWith('data:')) continue;
            const json = event.slice(5).trim();
            let payload: any; try { payload = JSON.parse(json); } catch { continue; }
            if (payload?.type === 'chunk' && typeof payload.delta === 'string') {
              // Guard: ensure target remains the active subtopic while streaming
              let stillActive = true;
              try {
                const activeIndex = (ui as any)?.getState?.().currentIndex ?? currentIndex;
                const activeId = initial.subtopics[activeIndex]?.id;
                stillActive = activeId === targetId;
              } catch {}
              if (stillActive) {
                setExplanations((e) => ({
                  ...e,
                  [targetId]: appendChunkSafely(e[targetId] || '', sanitizeMarkdown(payload.delta)),
                }));
              }
            } else if (payload?.type === 'done') {
              setExplanationDone((m) => ({ ...m, [targetId]: true }));
            } else if (payload?.type === 'error') {
              throw new Error(payload.error || 'stream error');
            }
          }
        }
      } catch (e: any) {
        setExplanations((ex) => ({ ...ex, [targetId]: 'Could not generate explanation. ' + (e?.message || '') }));
      }
    },
    [title, initial.title, initial.id, initial.originalContent, initial.subtopics]
  );

  // Convenience wrapper for buttons: uses current subtopic
  const fetchExplanation = useCallback(
    (style: 'default' | 'simplified' | 'detailed' | 'example' = 'default') =>
      fetchExplanationFor(currentSubtopic, style),
    [currentSubtopic, fetchExplanationFor]
  );

  // On initial mount, proactively regenerate the FIRST subtopic explanation once.
  // This guards against any stale/mismapped persisted content for index 0.
  useEffect(() => {
    if (forceFirstFixRef.current) return;
    if (!initial.subtopics || initial.subtopics.length === 0) return;
    // Only act if we are at the first subtopic
    // deferred: handled when explanation is ready to run in parallel with quiz
    return;
    const first = initial.subtopics[0];
    if (!first) return;
    forceFirstFixRef.current = true;
    // Clear then regenerate to ensure fresh, correct content
    setExplanations((e) => ({ ...e, [first.id]: '' }));
    void fetchExplanationFor(first, 'default');

    // Note: prefetch of second subtopic is handled by other effects to avoid
    // duplicate requests and potential content mixups on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On subtopic change: fetch explanation once and scroll to top
  useEffect(() => {
    const s = currentSubtopic;
    if (s && !explanations[s.id]) {
      fetchExplanationFor(s, 'default');
    }
    const currentReady = s ? Boolean(explanationDone[s.id]) : false;
    // Preload the NEXT subtopic explanation one step ahead, only after current explanation is done
    const nextIndex = currentIndex + 1;
    if (currentReady && nextIndex < initial.subtopics.length) {
      const next = initial.subtopics[nextIndex];
      if (next && !prefetchedNextRef.current.has(next.id)) {
        // Mark as prefetched to guard against StrictMode double effects
        prefetchedNextRef.current.add(next.id);
        // fire-and-forget preload
        (async () => {
          try {
            let model: string | undefined;
            try { model = localStorage.getItem('ai:model') || undefined; } catch {}
            const covered = initial.subtopics
              .slice(0, Math.max(0, nextIndex))
              .map((st) => ({ title: st.title, overview: st.overview }));
            const res = await fetch('/api/explain-db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lectureTitle: title || initial.title,
                subtopic: next.title,
                subtopicId: next.id,
                lectureId: initial.id,
                documentContent: initial.originalContent,
                covered,
                model,
              }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { markdown?: string };
            const md = sanitizeMarkdown(data.markdown || '');
            setExplanations((e) => ({ ...e, [next.id]: md || 'No content generated.' }));
            setExplanationDone((m) => ({ ...m, [next.id]: true }));

            // Preload quiz questions for the next subtopic as well
            try {
              if (!reserveQuestions(next.id)) return;
              const REQUIRED_QUESTIONS = 2;
              const existingCount = Array.isArray(questionsById[next.id])
                ? questionsById[next.id].length
                : Array.isArray(next.questions)
                  ? next.questions.length
                  : 0;
              let needed = Math.max(0, REQUIRED_QUESTIONS - existingCount);
              const lessonPayload = (md || '').trim();
              if (lessonPayload.length >= 50 && needed > 0) {
                const generated: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }> = [];
                while (needed > 0) {
                  const qRes = await fetch('/api/quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lessonMd: lessonPayload, difficulty: 'hard', subtopicTitle: next.title, lectureId: initial.id, overview: next.overview || '' }),
                  });
                  if (!qRes.ok) break;
                  const qData = (await qRes.json()) as {
                    questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }>;
                  };
                  const q = qData.questions?.[0];
                  if (!q) break;
                  generated.push({ prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation });
                  needed--;
                }
                if (generated.length) {
                  const save = await fetch('/api/quiz/questions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subtopicId: next.id, questions: generated }),
                  });
                  if (save.ok) {
                    const payload = (await save.json()) as {
                      questions: Array<{ id: string; prompt: string; options: string[]; answerIndex: number; explanation: string }>;
                    };
                    const saved = (payload.questions || []).slice(0, REQUIRED_QUESTIONS);
                    if (saved.length) {
                      // Update reactive questions map so the quiz is ready instantly when navigating
                      setQuestionsById((prev) => ({ ...prev, [next.id]: saved as unknown as QuizQuestion[] }));
                    }
                  }
                }
              }
            } catch {
              // swallow preloading errors
            } finally {
              releaseQuestions(next.id);
            }
          } catch {
            // If it failed early, allow retry on next navigation
            prefetchedNextRef.current.delete(next.id);
          }
        })();
      }
    }
    if (s) {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => scrollToMainTop());
      } else {
        scrollToMainTop();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubtopic?.id, explanationDone[currentSubtopic?.id || '']]);

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
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {stripLeadingTitle(explanations[currentSubtopic.id] || '', currentSubtopic.title) || 'Crafting learning module...'}
                </ReactMarkdown>
              </div>
            </div>

            {(() => {
              const lessonMd = stripLeadingTitle(explanations[currentSubtopic.id] || '', currentSubtopic.title).trim();
              const hasLesson = lessonMd.length >= 50;
              return (
                <div className="quiz-panel card p-6 md:p-8 xl:p-10">
                  <h3 className="mb-6 text-2xl font-bold tracking-tight">Mastery Check</h3>
                  {!hasLesson && (
                    <p className="mb-4 text-sm text-neutral-400">
                      Waiting for the lesson to finish… quiz will be prepared right after.
                    </p>
                  )}
                   <QuizPanel
                    key={currentSubtopic.id}
                    subtopicId={currentSubtopic.id}
                    subtopicTitle={currentSubtopic.title}
                    overview={currentSubtopic.overview}
                    explanationReady={Boolean(explanationDone[currentSubtopic.id])}
                    lectureId={initial.id}
                    lessonMd={lessonMd}
                     questions={questionsById[currentSubtopic.id] || currentSubtopic.questions}
                    reserveQuestions={reserveQuestions}
                    releaseQuestions={releaseQuestions}
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
                    // Mark complete so progress bar hits 100%
                    setIsCompleted(true);
                    setShowSparkle(true);
                    // Smoothly scroll to the top so the user can see the full progress bar
                    if (typeof requestAnimationFrame !== 'undefined') {
                      requestAnimationFrame(() => scrollToMainTop());
                    } else {
                      scrollToMainTop();
                    }
                    // Keep sparkle briefly, then hide
                    setTimeout(() => setShowSparkle(false), 1200);
                    // Give time for the bar's 500ms animation and the scroll to finish before redirecting
                    setTimeout(() => {
                      try { router.push(`/learn/${initial.id}/complete`); } catch {}
                    }, 1600);
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
                    onQuestionsSaved={(saved) => {
                      try {
                        const id = currentSubtopic.id;
                        setQuestionsById((prev) => ({ ...prev, [id]: saved }));
                      } catch {}
                    }}
                  />
                </div>
              );
            })()}
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
  overview,
  explanationReady,
  lectureId,
  lessonMd,
  questions,
  onPassed,
  onQuestionsSaved,
  reserveQuestions,
  releaseQuestions,
}: {
  subtopicId: string;
  subtopicTitle: string;
  overview?: string;
  explanationReady: boolean;
  lectureId: string;
  lessonMd?: string;
  questions: QuizQuestion[];
  onPassed: () => void;
  onQuestionsSaved?: (saved: QuizQuestion[]) => void;
  reserveQuestions?: (id: string) => boolean;
  releaseQuestions?: (id: string) => void;
}) {
  const stripABCD = (str: string) =>
    (str ?? '').replace(/^\s*[A-Da-d]\s*[.)-:]\s*/, '').trim();

  const [items, setItems] = useState<QuizQuestion[]>(() => questions || []);
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loadingAnother, setLoadingAnother] = useState(false);
  const [hardLoaded, setHardLoaded] = useState(false);
  const REQUIRED_QUESTIONS = 2;
  const hasRequired = items.length >= REQUIRED_QUESTIONS;

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
  const twoCorrect = hasRequired && answers[0] === items[0]?.answerIndex && answers[1] === items[1]?.answerIndex;

  const check = () => setRevealed(true);
  const tryAgain = () => setRevealed(false);

  // Optionally fetch questions from lesson content until we have REQUIRED_QUESTIONS
  useEffect(() => {
    // Only start once the explanation is fully ready to preserve question quality
    if (!explanationReady) return;
    if (hardLoaded || items.length >= REQUIRED_QUESTIONS) return;
    const lessonPayload = (lessonMd || '').trim();
    if (lessonPayload.length < 50) return;
    // Prevent duplicate generations (e.g., StrictMode double invoke / re-mounts)
    const reserved = reserveQuestions ? reserveQuestions(subtopicId) : true;
    if (!reserved) return;

    (async () => {
      let success = false;
      try {
        let needed = Math.max(0, REQUIRED_QUESTIONS - items.length);
        const generated: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }> = [];
        let tries = 0;
        const MAX_TRIES = 4 * Math.max(1, needed);
        while (needed > 0 && tries < MAX_TRIES) {
          tries++;
          const res = await fetch('/api/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lessonMd: lessonPayload, difficulty: 'hard', subtopicTitle, lectureId, overview }),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as {
            questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }>;
            debug?: any;
          };
          try { if (data?.debug) console.debug('[quiz]', { subtopicId, debug: data.debug }); } catch {}
          const q = data.questions?.[0];
          if (!q) continue;
          generated.push({ prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation });
          needed--;
        }
        if (generated.length) {
          // Persist to DB so these questions have stable IDs and survive reloads
          const save = await fetch('/api/quiz/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtopicId, questions: generated }),
          });
          if (save.ok) {
            const payload = (await save.json()) as {
              questions: Array<{ id: string; prompt: string; options: string[]; answerIndex: number; explanation: string }>;
            };
            const saved = (payload.questions || []).slice(0, REQUIRED_QUESTIONS);
            if (saved.length) {
              setItems(saved);
              setAnswers([]);
              setRevealed(false);
              success = true;
              // Inform parent so future mounts use the saved questions and avoid re-generating
              try { onQuestionsSaved?.(saved as unknown as QuizQuestion[]); } catch {}
            }
          }
        }
      } catch {
        // swallow
      } finally {
        setHardLoaded((prev) => prev || success);
        try { releaseQuestions?.(subtopicId); } catch {}
      }
    })();
  }, [explanationReady, lessonMd, hardLoaded, items.length, subtopicId, subtopicTitle, reserveQuestions, releaseQuestions]);

  const askAnother = async () => {
    setLoadingAnother(true);
    try {
      const payload = (lessonMd || '').trim();
      if (payload.length < 50) throw new Error('lesson too short');
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonMd: payload, difficulty: 'hard', subtopicTitle, lectureId, overview }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        questions: Array<{ prompt: string; options: string[]; answerIndex: number; explanation: string }>;
        debug?: any;
      };
      try { if (data?.debug) console.debug('[quiz/another]', { subtopicId, debug: data.debug }); } catch {}
      const q = data.questions?.[0];
      if (!q) throw new Error('No question returned');
      // Persist the one we generated if we still need more
      if (items.length < REQUIRED_QUESTIONS) {
        const save = await fetch('/api/quiz/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subtopicId,
            questions: [{ prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, explanation: q.explanation }],
          }),
        });
        if (save.ok) {
          const payload = (await save.json()) as {
            questions: Array<{ id: string; prompt: string; options: string[]; answerIndex: number; explanation: string }>;
          };
          const saved = (payload.questions || []).slice(0, REQUIRED_QUESTIONS);
          if (saved.length) {
            setItems(saved);
            setAnswers([]);
            setRevealed(false);
            try { onQuestionsSaved?.(saved as unknown as QuizQuestion[]); } catch {}
          }
        }
      }
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
  if (items.length < REQUIRED_QUESTIONS && !hardLoaded) {
    return <p className="text-sm text-neutral-400">Preparing questions…</p>;
  }


  if (explanationReady && (!items || items.length === 0) && hardLoaded) {
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
              <div className="font-medium text-neutral-200 chat-md">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    em: (props) => <em className="font-semibold not-italic" {...props} />,
                  }}
                >
                  {q.prompt}
                </ReactMarkdown>
              </div>
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
                      onClick={async () => {
                        setAns(i, j);
                        try {
                          // Record attempt (fire-and-forget)
                          void fetch('/api/quiz/attempt', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              questionId: q.id,
                              selectedIndex: j,
                              isCorrect: j === q.answerIndex,
                            }),
                          });
                        } catch {}
                      }}
                      className={buttonClass}
                      disabled={revealed && isAllCorrect}
                    >
                      {stripABCD(o)}
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <div className="mt-4 border-t border-neutral-800 pt-3 text-sm text-neutral-400 chat-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {q.explanation}
                  </ReactMarkdown>
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
            className="rounded-md bg-[rgb(var(--accent))] px-5 py-2 font-semibold text-black disabled:opacity-50"
          >
            Check Answer
          </button>
        )}

        {revealed && twoCorrect && (
          <>
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
