'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ChatPanel from '@/components/ChatPanel';
import dynamic from 'next/dynamic';
import { ArrowUpRight } from 'lucide-react';
import { rankFromElo, rankGradient } from '@/lib/client/rank-colors';

function GeneratingOverlayFallback(props: any) {
  const visible = Boolean(props?.visible);
  const hasError = Boolean(props?.hasError);
  const ariaLabel = hasError ? 'Generation failed' : 'Generating lesson…';
  if (!visible && !hasError) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-hidden={!visible}>
      <div className={`absolute inset-0 ${visible ? 'opacity-100' : 'opacity-0'} bg-black/60 transition-opacity duration-200`} />
      <div
        className={`rounded-xl border border-neutral-800 bg-neutral-950/70 shadow-2xl backdrop-blur-sm w-[92%] max-w-[520px] p-5 md:p-6 text-neutral-200 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        {!hasError ? (
          <div className="flex flex-col items-center text-center">
            <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-2 w-1/3 animate-[bar_1.2s_ease_infinite] rounded-full bg-[rgb(var(--accent))]" />
            </div>
            <div className="mt-4 text-base font-medium">Preparing your lesson…</div>
            <div className="mt-2 text-xs text-neutral-400">This can take up to a minute.</div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {props?.onCancel && (
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={props.onCancel}
                >
                  Cancel
                </button>
              )}
              {props?.onBack && (
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={props.onBack}
                >
                  Go back
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="text-base font-semibold text-red-300">Generation failed</div>
            <p className="mt-2 text-sm text-neutral-300">{props?.errorMessage || 'Something went wrong.'}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {props?.onRetry && (
                <button
                  className="rounded-md bg-[rgb(var(--accent))] px-3 py-1.5 text-sm font-semibold text-black hover:brightness-110"
                  onClick={props.onRetry}
                >
                  Retry
                </button>
              )}
              {props?.onBack && (
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={props.onBack}
                >
                  Back
                </button>
              )}
            </div>
          </div>
        )}
        <style jsx>{`
          @keyframes bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>
    </div>
  );
}

const GeneratingOverlay = dynamic<any>(() => import('@/components/GeneratingOverlay'), {
  ssr: false,
  loading: (props: any) => <GeneratingOverlayFallback {...props} />,
});
// Delete option removed inside lesson; available on dashboard only
// Icons not needed since deletion controls were removed from this view
import {
  deriveUnlockedIndex,
  type LearnLecture,
  type QuizQuestion,
  type LearnSubtopic,
} from '@/lib/shared/learn-types';
import { createLearnUIStore } from '@/lib/client/learn-ui-store';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';

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
    t = lines
      .map((l) => l.replace(/^ {4}/, ''))
      .join('\n')
      .trim();
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
  const needsSpace =
    // word + word (e.g., "feathers" + "While")
    ((isWordChar(lastChar) && isWordChar(firstChar)) ||
      // sentence/colon punctuation followed by a word with no whitespace
      (/[\.:;!?]$/.test(previous) && isWordChar(firstChar))) &&
    !/^\s/.test(next);
  return needsSpace ? previous + ' ' + next : previous + next;
}

// Merge an incoming streamed chunk robustly:
// - Sanitize like the final renderer would
// - Deduplicate if the provider sends cumulative chunks (common with some streams)
// - Avoid gluing words across boundaries
function mergeStreamChunk(previous: string, incoming: string): string {
  const incSan = sanitizeMarkdown(incoming);
  if (!previous) return incSan;
  if (!incSan) return previous;

  // Deduplicate overlap (largest suffix of previous that matches prefix of incoming)
  const prevTail = previous.slice(Math.max(0, previous.length - 4096));
  const maxOverlap = Math.min(prevTail.length, incSan.length);
  let overlap = 0;
  for (let k = maxOverlap; k > 0; k--) {
    if (prevTail.endsWith(incSan.slice(0, k))) {
      overlap = k;
      break;
    }
  }
  const novel = incSan.slice(overlap);
  return appendChunkSafely(previous, novel);
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
      if (
        firstLine.localeCompare(title.trim(), undefined, {
          sensitivity: 'accent',
        }) === 0
      ) {
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

export default function LearnView({
  initial,
  readonly = false,
  demo = false,
}: {
  initial: LearnLecture;
  readonly?: boolean;
  demo?: boolean;
}) {
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
  // In-content ELO toast state
  const [eloToastFrom, setEloToastFrom] = useState<number | null>(null);
  const [eloToastTo, setEloToastTo] = useState<number | null>(null);
  const [showEloToast, setShowEloToast] = useState<boolean>(false);
  const eloToastTimerRef = useRef<number | null>(null);
  const eloBaseRef = useRef<number | null>(null);
  const lastToastAtRef = useRef<number>(0);
  const lastToastDeltaRef = useRef<number>(0);

  // Generation overlay state for initial lesson build
  const [genVisible, setGenVisible] = useState(false);
  const [genHasError, setGenHasError] = useState(false);
  const [genErrorMessage, setGenErrorMessage] = useState<string>('');
  const genStartAtRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const ttfbSentRef = useRef<boolean>(false);
  const genStartedRef = useRef<boolean>(false);
  // Track in-flight explanation streams per subtopic so we can cancel stale ones
  const explainControllersRef = useRef<Map<string, AbortController>>(new Map());
  // Track a run ID per subtopic to discard stale chunks from earlier streams
  const explainRunIdRef = useRef<Map<string, string>>(new Map());

  // Cleanup: abort any active streams on unmount
  useEffect(() => {
    return () => {
      try {
        if (abortRef.current) abortRef.current.abort();
      } catch {}
      try {
        for (const [, ctl] of explainControllersRef.current) ctl.abort();
      } catch {}
      explainControllersRef.current.clear();
      explainRunIdRef.current.clear();
    };
  }, []);

  const postTelemetry = useCallback(
    (event: string, data?: Record<string, unknown>) => {
      try {
        void fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event,
            lectureId: initial.id,
            ts: Date.now(),
            ...data,
          }),
        });
      } catch {}
    },
    [initial.id]
  );

  // Lock body scroll while overlay is visible
  useBodyScrollLock(genVisible);

  // Seed base ELO for toast animation to sync with navbar counter
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users/me', { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as any;
        const elo = Number(data?.user?.elo ?? 0);
        if (Number.isFinite(elo)) eloBaseRef.current = elo;
        else eloBaseRef.current = 0;
      } catch {
        eloBaseRef.current = eloBaseRef.current ?? 0;
      }
    })();
  }, []);

  // Show a brief in-content toast when ELO increases so it's visible even if navbar is off-screen
  useEffect(() => {
    const onDelta = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail || {};
        const deltaNum = Number(detail?.delta ?? 0);
        const delta = Number.isFinite(deltaNum) ? Math.trunc(deltaNum) : 0;
        if (delta <= 0) return;

        // Coalesce duplicate events (e.g., dev StrictMode or double dispatch)
        const now = Date.now();
        if (delta === lastToastDeltaRef.current && now - lastToastAtRef.current < 250) {
          return;
        }
        lastToastDeltaRef.current = delta;
        lastToastAtRef.current = now;

        const base = (eloBaseRef.current ?? 0);
        const from = base;
        const to = base + delta;
        eloBaseRef.current = to;
        setEloToastFrom(Math.max(0, from));
        setEloToastTo(Math.max(0, to));
        setShowEloToast(true);
        if (typeof window !== 'undefined') {
          if (eloToastTimerRef.current) window.clearTimeout(eloToastTimerRef.current);
          eloToastTimerRef.current = window.setTimeout(() => setShowEloToast(false), 1500);
        }
      } catch {}
    };
    window.addEventListener('elo:delta', onDelta as EventListener);
    return () => {
      window.removeEventListener('elo:delta', onDelta as EventListener);
      try {
        if (eloToastTimerRef.current) window.clearTimeout(eloToastTimerRef.current);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function EloToast({ from, to }: { from: number; to: number }) {
    const [displayed, setDisplayed] = useState<number>(from);
    const [glow, setGlow] = useState<boolean>(false);
    const animFrameRef = useRef<number | null>(null);
    const animStartRef = useRef<number>(0);
    const animFromRef = useRef<number>(from);
    const animToRef = useRef<number>(to);
    const prefersReducedRef = useRef<boolean>(false);

    const DURATION_MS = 700;

    const isReducedMotion = (): boolean => {
      try {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        return false;
      }
    };

    const stopAnim = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const step = () => {
      const t = performance.now ? performance.now() : Date.now();
      const elapsed = Math.max(0, Math.min(DURATION_MS, t - animStartRef.current));
      const p = easeOutCubic(elapsed / DURATION_MS);
      const value = Math.round(
        animFromRef.current + (animToRef.current - animFromRef.current) * p
      );
      setDisplayed(value);
      if (elapsed < DURATION_MS) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        // If target changed during the run, continue smoothly
        if (animToRef.current !== value) {
          animFromRef.current = value;
          animStartRef.current = performance.now ? performance.now() : Date.now();
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          stopAnim();
          setDisplayed(animToRef.current);
        }
      }
    };

    useEffect(() => {
      // Initial kick-off
      prefersReducedRef.current = isReducedMotion();
      if (prefersReducedRef.current) {
        stopAnim();
        setDisplayed(to);
        setGlow(true);
        setTimeout(() => setGlow(false), 800);
        return;
      }
      setDisplayed(from);
      animFromRef.current = from;
      animToRef.current = to;
      animStartRef.current = performance.now ? performance.now() : Date.now();
      setGlow(true);
      setTimeout(() => setGlow(false), 800);
      animFrameRef.current = requestAnimationFrame(step);
      return () => stopAnim();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When target updates while showing, smoothly retarget without restarting from scratch
    useEffect(() => {
      if (prefersReducedRef.current) {
        setDisplayed(to);
        return;
      }
      const now = performance.now ? performance.now() : Date.now();
      // Compute instantaneous displayed value as new from-base
      if (animFrameRef.current !== null) {
        const elapsed = Math.max(0, Math.min(DURATION_MS, now - animStartRef.current));
        const p = easeOutCubic(elapsed / DURATION_MS);
        const currentValue = Math.round(
          animFromRef.current + (animToRef.current - animFromRef.current) * p
        );
        animFromRef.current = currentValue;
        animStartRef.current = now;
        animToRef.current = to;
      } else {
        animFromRef.current = displayed;
        animStartRef.current = now;
        animToRef.current = to;
        animFrameRef.current = requestAnimationFrame(step);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [to]);

    const rank = rankFromElo(to || 0);
    const grad = rankGradient(rank.slug);
    return (
      <div
        className={
          'group inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2.5 py-1.5 text-sm text-neutral-200 transition-shadow ' +
          (glow ? 'shadow-[0_0_24px_rgba(34,197,94,0.35)] ring-1 ring-green-500/30' : '')
        }
        role="status"
        aria-label={`ELO ${to}`}
        aria-live="polite"
      >
        <span className={`bg-gradient-to-r ${grad} bg-clip-text text-transparent rank-shimmer rank-contrast`}>ELO</span>
        <span className={`bg-gradient-to-r ${grad} bg-clip-text font-semibold tabular-nums text-transparent rank-shimmer rank-contrast`}>
          {displayed}
        </span>
        {glow && <ArrowUpRight className="h-3.5 w-3.5 text-green-400" aria-hidden />}
      </div>
    );
  }

  // Maintain a reactive questions map keyed by subtopicId so UI updates immediately
  const [questionsById, setQuestionsById] = useState<
    Record<string, QuizQuestion[]>
  >(() =>
    Object.fromEntries(initial.subtopics.map((s) => [s.id, s.questions || []]))
  );

  // Prevent duplicate quiz generation across preloader and panel
  const questionsInFlightRef = useRef<Set<string>>(new Set());
  const reserveQuestions = useCallback((id: string): boolean => {
    const s = questionsInFlightRef.current;
    if (s.has(id)) return false;
    s.add(id);
    return true;
  }, []);

  // Prevent duplicate explanation generation (e.g., React StrictMode double effects
  // and races between prefetch and active streaming for the same subtopic)
  const explanationsInFlightRef = useRef<Set<string>>(new Set());
  const reserveExplanation = useCallback((id: string): boolean => {
    const s = explanationsInFlightRef.current;
    if (s.has(id)) return false;
    s.add(id);
    return true;
  }, []);
  const releaseExplanation = useCallback((id: string): void => {
    explanationsInFlightRef.current.delete(id);
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
      initial.subtopics.map((s) => [
        s.id,
        s.explanation ? sanitizeMarkdown(s.explanation) : '',
      ])
    )
  );
  // Track when a subtopic's explanation is fully generated
  const [explanationDone, setExplanationDone] = useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      initial.subtopics.map((s) => [
        s.id,
        Boolean(s.explanation && s.explanation.length > 0),
      ])
    )
  );

  // Start streaming missing subtopics (used on mount and on retry)
  const startStreaming = useCallback(async () => {
    if (readonly) return;
    if (streaming || genStartedRef.current) return;
    genStartedRef.current = true;
    setGenHasError(false);
    setGenErrorMessage('');
    setStreaming(true);
    setGenVisible(true);
    genStartAtRef.current = Date.now();
    ttfbSentRef.current = false;
    // Approximate time-to-first-frame of overlay
    try {
      const t0 = performance.now ? performance.now() : Date.now();
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          const dt = (performance.now ? performance.now() : Date.now()) - t0;
          if (!ttfbSentRef.current) {
            ttfbSentRef.current = true;
            postTelemetry('gen_overlay_ttfb', { ms: Math.max(0, Math.round(dt)) });
          }
        });
      }
    } catch {}

    const qs = new URLSearchParams({ lectureId: initial.id });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch('/api/lectures/stream?' + qs.toString(), {
        signal: ac.signal,
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
          let payload: any;
          try {
            payload = JSON.parse(json);
          } catch {
            continue;
          }
          if (payload?.type === 'subtopic' && payload.subtopic) {
            const s = payload.subtopic as any;
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
            ui.setState((st) => ({
              ...st,
              currentIndex: st.currentIndex,
              unlockedIndex: Math.max(st.unlockedIndex, st.currentIndex),
            }));
            setExplanations((e) => ({ ...e, [s.id]: s.explanation || '' }));
          } else if (payload?.type === 'title' && typeof payload.title === 'string') {
            setTitle(String(payload.title));
          } else if (payload?.type === 'done') {
            // finished initial stream
          } else if (payload?.type === 'error') {
            throw new Error(payload?.error || 'stream error');
          }
        }
      }
      const totalMs = Math.max(0, Date.now() - (genStartAtRef.current || Date.now()));
      postTelemetry('gen_total_wait', { ms: totalMs });
      setGenVisible(false);
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError';
      if (isAbort) {
        postTelemetry('gen_cancel');
        setGenHasError(true);
        setGenErrorMessage('Generation was cancelled.');
        setGenVisible(true);
      } else {
        postTelemetry('gen_error', { message: String(e?.message || e) });
        setGenHasError(true);
        setGenErrorMessage(String(e?.message || 'Generation failed'));
        setGenVisible(true);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      genStartedRef.current = false;
    }
  }, [readonly, streaming, initial.id, ui, setExplanations, postTelemetry]);

  // On first mount, if there are no subtopics yet, stream them progressively
  useEffect(() => {
    if (readonly) return;
    if (!initial.subtopics || initial.subtopics.length === 0) {
      void startStreaming();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress state (green progress bar in left sidebar)
  const initialMastered = initial.subtopics.filter((s) => s.mastered).length;
  const totalCount = initial.subtopics.length;
  const [masteredCount, setMasteredCount] = useState<number>(initialMastered);
  // NEW: track which subtopics are already counted to avoid double-increment
  const countedIdsRef = useRef<Set<string>>(
    new Set(initial.subtopics.filter((s) => s.mastered).map((s) => s.id))
  );

  const progressPct = Math.round(
    (masteredCount / Math.max(1, totalCount)) * 100
  );
  const progressPctSafe = isCompleted ? 100 : progressPct;

  const canSelect = (i: number) => i <= unlockedIndex;

  // Demo-only synthesized document for chat grounding
  const demoDoc = useMemo(() => {
    if (!demo) return null as string | null;
    try {
      const parts: string[] = [];
      parts.push(`# ${initial.title}`);
      for (const s of initial.subtopics) {
        const title = s.title?.trim();
        const overview = (s.overview || '').trim();
        const explanation = (s.explanation || '').trim();
        if (title) parts.push(`\n## ${title}`);
        if (overview) parts.push(overview);
        if (explanation) {
          const trimmed =
            explanation.length > 1200
              ? explanation.slice(0, 1200) + '…'
              : explanation;
          parts.push(trimmed);
        }
      }
      return parts.join('\n\n').trim();
    } catch {
      return initial.originalContent || '';
    }
  }, [demo, initial.title, initial.subtopics, initial.originalContent]);

  const chatIntro = demo
    ? "I'm your AI Tutor for this demo. I'm grounded on this lesson's titles, overviews, and explanations. Ask me anything about it!"
    : undefined;

  // Current subtopic content to ground the AI Tutor (title + overview + explanation if available)
  const currentSubtopicDoc = useMemo(() => {
    try {
      const s = currentSubtopic;
      if (!s) return '';
      const title = s.title?.trim();
      const overview = (s.overview || '').trim();
      const explanationRaw = (explanations[s.id] || '').trim();
      const explanation = stripLeadingTitle(explanationRaw, title).trim();
      const parts: string[] = [];
      if (title) parts.push(`# ${title}`);
      if (overview) parts.push(overview);
      if (explanation) parts.push(explanation);
      return parts.join('\n\n').trim();
    } catch {
      return '';
    }
  }, [currentSubtopic?.id, explanations[currentSubtopic?.id || '']]);

  // Keep unlockedIndex sane if server state changes
  useEffect(() => {
    const u = deriveUnlockedIndex(initial.subtopics);
    ui.setState((s) => ({
      ...s,
      unlockedIndex: Math.max(u, s.unlockedIndex),
      currentIndex: Math.max(
        0,
        Math.min(s.currentIndex, initial.subtopics.length - 1)
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.subtopics.map((s) => (s as any).mastered).join('|')]);

  const fetchExplanationFor = useCallback(
    async (
      target: LearnSubtopic | null | undefined,
      style: 'default' | 'simplified' | 'detailed' | 'example' = 'default'
    ) => {
      if (!target) return;
      const targetId = target.id;
      const targetTitle = target.title;
      // Guard: only stream for the ACTIVE subtopic being viewed.
      try {
        const activeIndex =
          (ui as any)?.getState?.().currentIndex ?? currentIndex;
        const activeId = initial.subtopics[activeIndex]?.id;
        if (activeId !== targetId) {
          return;
        }
      } catch {}
      // Guard: avoid duplicate in-flight generation for the same subtopic.
      // If a background prefetch has reserved this ID (no controller), override it so active view wins.
      if (!reserveExplanation(targetId)) {
        const hasController = explainControllersRef.current.has(targetId);
        if (!hasController) {
          // Reservation likely from prefetch; take over
          releaseExplanation(targetId);
          if (!reserveExplanation(targetId)) return;
        } else {
          return;
        }
      }
      try {
        const targetIndex = Math.max(
          0,
          initial.subtopics.findIndex((st) => st.id === targetId)
        );
        const covered =
          targetIndex > 0
            ? initial.subtopics
                .slice(0, targetIndex)
                .map((st) => ({ title: st.title, overview: st.overview }))
            : [];
        // Prepare abort + run guard for this subtopic
        const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        explainRunIdRef.current.set(targetId, runId);
        // Abort any previous stream for this same subtopic
        try {
          const prev = explainControllersRef.current.get(targetId);
          if (prev) prev.abort();
        } catch {}
        const ac = new AbortController();
        explainControllersRef.current.set(targetId, ac);

        const qs = new URLSearchParams({ stream: '1' });
        const res = await fetch('/api/explain-db?' + qs.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lectureTitle: title || initial.title,
            subtopic: targetTitle,
            // Avoid persisting in demo: omit IDs so the API won't write to DB
            subtopicId: demo ? '' : targetId,
            lectureId: demo ? '' : initial.id,
            documentContent: initial.originalContent,
            covered,
            style,
          }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let started = false;
        const yieldFrame = () =>
          new Promise<void>((r) => {
            if (typeof requestAnimationFrame !== 'undefined')
              requestAnimationFrame(() => r());
            else setTimeout(r, 0);
          });
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
            let payload: any;
            try {
              payload = JSON.parse(json);
            } catch {
              continue;
            }
            if (
              payload?.type === 'chunk' &&
              typeof payload.delta === 'string'
            ) {
              // Guard: ensure target remains the active subtopic while streaming
              let stillActive = true;
              try {
                const activeIndex =
                  (ui as any)?.getState?.().currentIndex ?? currentIndex;
                const activeId = initial.subtopics[activeIndex]?.id;
                stillActive = activeId === targetId;
              } catch {}
              // Guard: ensure this chunk belongs to the latest run for this subtopic
              const isLatestRun =
                explainRunIdRef.current.get(targetId) === runId;
              if (stillActive && isLatestRun) {
                const delta = payload.delta as string;
                if (!started) {
                  started = true;
                  setExplanations((e) => ({
                    ...e,
                    [targetId]: sanitizeMarkdown(delta),
                  }));
                } else {
                  setExplanations((e) => ({
                    ...e,
                    [targetId]: mergeStreamChunk(e[targetId] || '', delta),
                  }));
                }
                // Let the browser paint between chunks to avoid "all at once" dumps
                await yieldFrame();
              }
            } else if (payload?.type === 'done') {
              const isLatestRun =
                explainRunIdRef.current.get(targetId) === runId;
              if (isLatestRun) {
                setExplanationDone((m) => ({ ...m, [targetId]: true }));
              }
            } else if (payload?.type === 'error') {
              throw new Error(payload.error || 'stream error');
            }
          }
        }
      } catch (e: any) {
        // If aborted, do not overwrite any existing content with an error message
        if (e?.name !== 'AbortError') {
          setExplanations((ex) => ({
            ...ex,
            [targetId]: 'Could not generate explanation. ' + (e?.message || ''),
          }));
        }
      } finally {
        try {
          const c = explainControllersRef.current.get(targetId);
          if (c) c.abort();
        } catch {}
        explainControllersRef.current.delete(targetId);
        explainRunIdRef.current.delete(targetId);
        releaseExplanation(targetId);
      }
    },
    [
      title,
      initial.title,
      initial.id,
      initial.originalContent,
      initial.subtopics,
      demo,
    ]
  );

  // Convenience wrapper for buttons: uses current subtopic
  const fetchExplanation = useCallback(
    (style: 'default' | 'simplified' | 'detailed' | 'example' = 'default') =>
      fetchExplanationFor(currentSubtopic, style),
    [currentSubtopic, fetchExplanationFor]
  );

  // Remove previously-deferred first-subtopic auto-regeneration to avoid
  // accidental double streams on mount.

  // On subtopic change: fetch explanation once and scroll to top
  useEffect(() => {
    if (readonly) return;
    const s = currentSubtopic;
    // Cancel any background streams for other subtopics when switching
    try {
      for (const [id, ctl] of explainControllersRef.current) {
        if (s && id !== s.id) ctl.abort();
      }
    } catch {}
    if (s && !explanations[s.id]) {
      // Start fetching explanation immediately
      fetchExplanationFor(s, 'default');
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

  // After explanation finishes, prefetch the next subtopic (no scroll)
  useEffect(() => {
    if (readonly) return;
    const s = currentSubtopic;
    if (!s) return;
    const currentReady = Boolean(explanationDone[s.id]);
    const nextIndex = currentIndex + 1;
    if (currentReady && nextIndex < initial.subtopics.length) {
      const next = initial.subtopics[nextIndex];
      if (next && !prefetchedNextRef.current.has(next.id)) {
        // Reserve explanation to prevent a race with on-navigation streaming
        const reservedExplain = reserveExplanation(next.id);
        if (!reservedExplain) {
          // Another generation already owns this subtopic; skip prefetch
          return;
        }
        // Mark as prefetched to guard against StrictMode double effects
        prefetchedNextRef.current.add(next.id);
        // fire-and-forget preload
        (async () => {
          try {
            const covered = initial.subtopics
              .slice(0, Math.max(0, nextIndex))
              .map((st) => ({ title: st.title, overview: st.overview }));
            const res = await fetch('/api/explain-db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lectureTitle: title || initial.title,
                subtopic: next.title,
                // Persist during prefetch so content survives reloads
                subtopicId: demo ? '' : next.id,
                lectureId: demo ? '' : initial.id,
                documentContent: initial.originalContent,
                covered,
              }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { markdown?: string };
            const md = sanitizeMarkdown(data.markdown || '');
            // If an ACTIVE stream is running for this subtopic, ignore prefetch result to avoid double content.
            // Reservation alone (from prefetch) should NOT block storing the prefetched explanation.
            const hasActiveStream = explainControllersRef.current.has(next.id);
            if (!hasActiveStream) {
              setExplanations((e) => ({
                ...e,
                [next.id]: md || 'No content generated.',
              }));
              setExplanationDone((m) => ({ ...m, [next.id]: true }));
            }

            // Preload quiz questions for the next subtopic in series to avoid duplicates
            try {
              if (!reserveQuestions(next.id)) return;
              const REQUIRED_QUESTIONS = 2;
              const existingCount = Array.isArray(questionsById[next.id])
                ? questionsById[next.id].length
                : Array.isArray(next.questions)
                  ? next.questions.length
                  : 0;
              const needed = Math.max(0, REQUIRED_QUESTIONS - existingCount);
              const lessonPayload = (md || '').trim();
              if (lessonPayload.length >= 50 && needed > 0) {
                // Request up to `needed` questions in a single call to reduce overlap
                const generated: Array<{
                  prompt: string;
                  options: string[];
                  answerIndex: number;
                  explanation: string;
                }> = [];
                const existingPrompts = new Set<string>(
                  [
                    ...(Array.isArray(questionsById[next.id])
                      ? questionsById[next.id]
                      : []
                    ).map((q) => q.prompt),
                    ...(Array.isArray(next.questions)
                      ? next.questions
                      : []
                    ).map((q: any) => q.prompt),
                  ].filter(Boolean)
                );
                try {
                  const qRes = await fetch('/api/quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      lessonMd: lessonPayload,
                      difficulty: 'hard',
                      subtopicTitle: next.title,
                      lectureId: initial.id,
                      overview: next.overview || '',
                      subtopicId: next.id,
                      avoidPrompts: Array.from(existingPrompts),
                      count: Math.min(2, needed),
                    }),
                  });
                  if (qRes.ok) {
                    const qData = (await qRes.json()) as {
                      questions: Array<{
                        prompt: string;
                        options: string[];
                        answerIndex: number;
                        explanation: string;
                      }>;
                    };
                    for (const cand of qData.questions || []) {
                      const prompt = String(cand?.prompt || '').trim();
                      if (
                        !prompt ||
                        existingPrompts.has(prompt) ||
                        generated.some((g) => g.prompt === prompt)
                      )
                        continue;
                      generated.push(cand);
                      existingPrompts.add(prompt);
                      if (generated.length >= needed) break;
                    }
                  }
                } catch {}

                if (generated.length) {
                  if (!demo) {
                    const save = await fetch('/api/quiz/questions', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        subtopicId: next.id,
                        questions: generated,
                      }),
                    });
                    if (save.ok) {
                      const payload = (await save.json()) as {
                        questions: Array<{
                          id: string;
                          prompt: string;
                          options: string[];
                          answerIndex: number;
                          explanation: string;
                        }>;
                      };
                      const saved = (payload.questions || []).slice(
                        0,
                        REQUIRED_QUESTIONS
                      );
                      if (saved.length) {
                        setQuestionsById((prev) => ({
                          ...prev,
                          [next.id]: saved as unknown as QuizQuestion[],
                        }));
                      }
                    }
                  } else {
                    // Demo mode: use ephemeral questions with temp IDs
                    const temp = generated.map((q, idx) => ({
                      ...q,
                      id: `${next.id}-temp-${Date.now()}-${idx}`,
                    })) as unknown as QuizQuestion[];
                    setQuestionsById((prev) => ({ ...prev, [next.id]: temp }));
                  }
                }
              }
            } catch {
              // swallow preloading errors
            } finally {
              releaseQuestions(next.id);
              if (reservedExplain) releaseExplanation(next.id);
            }
          } catch {
            // If it failed early, allow retry on next navigation
            prefetchedNextRef.current.delete(next.id);
            if (reservedExplain) releaseExplanation(next.id);
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSubtopic?.id, explanationDone[currentSubtopic?.id || '']]);

  // rename removed from lesson page

  return (
    <div className="grid grid-cols-1 gap-8 px-2 md:px-4 lg:grid-cols-12 lg:gap-10 xl:gap-12">
      {/* Left: Outline */}
      <aside
        className="space-y-5 self-start rounded-lg border border-neutral-800 p-6 lg:col-span-3 lg:p-7 xl:p-8"
        data-tour="outline"
      >
        <h2 className="text-xl font-semibold">Lecture</h2>

        {/* Progress bar */}
        <div className="mt-2" data-tour="progress">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
            <span>Progress</span>
            <span>
              {masteredCount}/{totalCount} ({progressPctSafe}%)
            </span>
          </div>

          {/* Bar + non-clipped glow */}
          <div className="relative">
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-green-600 transition-[width] duration-500"
                style={{ width: `${progressPctSafe}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute top-1/2 left-0 z-20 -translate-y-1/2"
              style={{ width: `${progressPctSafe}%` }}
            >
              <div className="h-4 w-full rounded-full bg-green-400/40 mix-blend-screen blur-[10px]" />
            </div>
          </div>
        </div>

        {/* Title is managed on the Dashboard now */}

        <div className="mt-4 mb-2">
          <div className="text-sm text-neutral-400 uppercase">Title</div>
          <div className="text-lg font-semibold">{title}</div>
        </div>

        {/* Deletion is managed on the dashboard; no delete button here */}

        {/* No deletion error state in lesson view */}

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
      <main
        ref={mainRef}
        className={`relative lg:col-span-6 ${readonly ? 'lg:col-span-9' : ''}`}
        aria-busy={genVisible ? true : undefined}
      >
        {showEloToast && eloToastFrom !== null && eloToastTo !== null && (
          <div className="pointer-events-none absolute right-0 top-0 z-20 p-2 md:p-3">
            <div className="pointer-events-auto">
              <EloToast from={eloToastFrom} to={eloToastTo} />
            </div>
          </div>
        )}
        {currentSubtopic ? (
          <div className="space-y-8">
            <div className="card p-6 md:p-8 xl:p-10" data-tour="content-pane">
              <h3 className="text-3xl font-bold tracking-tight">
                {currentSubtopic.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-400">
                <span>Importance: {currentSubtopic.importance}</span>{' '}
                <span>•</span>{' '}
                <span>Difficulty: {currentSubtopic.difficulty}</span>
              </div>
              {!readonly && !demo && (
                <>
                  <div className="mt-6 flex items-center gap-2 border-t border-neutral-800/50 pt-4">
                    <span className="text-sm font-medium text-neutral-400">
                      Style:
                    </span>
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
                </>
              )}
              <div
                id="lesson-markdown"
                data-lesson="markdown"
                className="markdown"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {stripLeadingTitle(
                    explanations[currentSubtopic.id] || '',
                    currentSubtopic.title
                  ) || 'Crafting learning module...'}
                </ReactMarkdown>
              </div>
            </div>

            {!readonly &&
              (() => {
                const lessonMd = stripLeadingTitle(
                  explanations[currentSubtopic.id] || '',
                  currentSubtopic.title
                ).trim();
                const hasLesson = lessonMd.length >= 50;
                return (
                  <div className="quiz-panel card p-6 md:p-8 xl:p-10" data-tour="quiz-panel">
                    <h3 className="mb-6 text-2xl font-bold tracking-tight">
                      Mastery Check
                    </h3>
                    {!hasLesson && (
                      <p className="mb-4 text-sm text-neutral-400">
                        Waiting for the lesson to finish… quiz will be prepared
                        right after.
                      </p>
                    )}
                    <QuizPanel
                      key={currentSubtopic.id}
                      subtopicId={currentSubtopic.id}
                      subtopicTitle={currentSubtopic.title}
                      overview={currentSubtopic.overview}
                      explanationReady={Boolean(
                        explanationDone[currentSubtopic.id]
                      )}
                      lectureId={initial.id}
                      lessonMd={lessonMd}
                      questions={
                        questionsById[currentSubtopic.id] ||
                        currentSubtopic.questions
                      }
                      reserveQuestions={reserveQuestions}
                      releaseQuestions={releaseQuestions}
                      disablePersistence={demo}
                       onPassed={async (firstPerfect) => {
                        const id = currentSubtopic.id;
                        if (!countedIdsRef.current.has(id)) {
                          countedIdsRef.current.add(id);
                          setMasteredCount((m) => Math.min(totalCount, m + 1));
                        }

                        /* END-OF-LECTURE */
                        const isLast =
                          currentIndex === initial.subtopics.length - 1;
                        // Persist mastery only outside demo
                         if (!demo) {
                           try {
                             // Determine if the first check for this set was a perfect 2/2
                             void (async () => {
                               const res = await fetch('/api/mastery', {
                                 method: 'POST',
                                 headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({
                                   subtopicId: currentSubtopic.id,
                                   firstPerfect,
                                 }),
                               });
                               if (res.ok) {
                                 const data = (await res.json().catch(() => ({}))) as any;
                                 const d = Number(data?.eloDelta ?? 0);
                                 if (Number.isFinite(d) && d > 0) {
                                   try {
                                     window.dispatchEvent(
                                       new CustomEvent('elo:delta', { detail: { delta: Math.trunc(d) } })
                                     );
                                   } catch {}
                                 } else {
                                   // If no delta returned but mastery succeeded, attempt a refresh
                                   if (data && data.ok) {
                                     try {
                                       window.dispatchEvent(new Event('elo:maybeRefresh'));
                                     } catch {}
                                   }
                                 }
                               }
                             })();
                           } catch {}
                         }

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
                          // In demo, do not navigate away; otherwise go to completion page
                          if (!demo) {
                            setTimeout(() => {
                              try {
                                router.push(`/learn/${initial.id}/complete`);
                              } catch {}
                            }, 1600);
                          }
                          return;
                        }
                        // Optimistic advance
                        const idx = currentIndex;
                        const next = Math.min(
                          idx + 1,
                          initial.subtopics.length - 1
                        );
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
                          setQuestionsById((prev) => ({
                            ...prev,
                            [id]: saved,
                          }));
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
      {!readonly && (
        <aside
          className="sticky top-24 h-[calc(100vh-8rem)] self-start lg:col-span-3"
          data-tour="chat-panel"
        >
          <ChatPanel
            documentContent={
              demo
                ? currentSubtopicDoc || demoDoc || initial.originalContent || ''
                : currentSubtopicDoc || initial.originalContent || ''
            }
            lectureId={initial.id}
            intro={chatIntro}
            demoMode={demo}
          />
        </aside>
      )}

      {/* Live region for screen readers */}
      {/* Screen reader messages for deletion are no longer needed here */}

      {/* Deletion overlay removed from lesson view */}

      {/* Lesson generation overlay */}
      <GeneratingOverlay
        visible={genVisible}
        hasError={genHasError}
        errorMessage={genErrorMessage}
        onCancel={() => {
          try {
            if (abortRef.current) {
              const ok = typeof window !== 'undefined' ? window.confirm('Cancel generation?') : true;
              if (ok) abortRef.current.abort();
            }
          } catch {}
        }}
        onRetry={() => {
          setGenHasError(false);
          setGenErrorMessage('');
          void startStreaming();
          postTelemetry('gen_retry');
        }}
        onBack={() => {
          try {
            router.push('/dashboard');
          } catch {}
        }}
      />

      {/* No-JS fallback: show static informative state on initial generation */}
      <noscript>
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="rounded-md border border-neutral-800 bg-neutral-950 px-5 py-4 text-neutral-200">
            <div className="text-sm">Generating your lesson… This can take up to a minute.</div>
          </div>
        </div>
      </noscript>
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
  disablePersistence,
}: {
  subtopicId: string;
  subtopicTitle: string;
  overview?: string;
  explanationReady: boolean;
  lectureId: string;
  lessonMd?: string;
  questions: QuizQuestion[];
  onPassed: (firstPerfect: boolean) => void;
  onQuestionsSaved?: (saved: QuizQuestion[]) => void;
  reserveQuestions?: (id: string) => boolean;
  releaseQuestions?: (id: string) => void;
  disablePersistence?: boolean;
}) {
  const stripABCD = (str: string) =>
    (str ?? '').replace(/^\s*[A-Da-d]\s*[.)-:]\s*/, '').trim();

  // Stable, seeded shuffle so the correct answer isn't position-biased and
  // ordering is consistent per question across rerenders.
  const hashStringToSeed = (s: string): number => {
    let h = 2166136261 >>> 0; // FNV-1a base
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const seededRandomFactory = (seed: number) => {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };
  const shuffleOptionsWithAnswerSeeded = (
    options: string[],
    answerIndex: number,
    seedStr: string
  ): { options: string[]; answerIndex: number } => {
    const rng = seededRandomFactory(hashStringToSeed(seedStr));
    const pairs = options.map((opt, idx) => ({ opt, idx }));
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }
    const newOptions = pairs.map((p) => p.opt);
    let newAnswerIndex = pairs.findIndex((p) => p.idx === answerIndex);
    // Guard: avoid placing the correct answer at index 0 to reduce perceived bias
    if (newAnswerIndex === 0) {
      const rng2 = seededRandomFactory(hashStringToSeed(`${seedStr}|nofirst`));
      const j = 1 + Math.floor(rng2() * 3); // pick 1..3 uniformly
      [newOptions[0], newOptions[j]] = [newOptions[j], newOptions[0]];
      newAnswerIndex = j;
    }
    return { options: newOptions, answerIndex: newAnswerIndex };
  };
  const shuffleForDisplay = (q: QuizQuestion): QuizQuestion => {
    const seed = q.id || `${q.prompt}:${q.explanation}`;
    const sh = shuffleOptionsWithAnswerSeeded(q.options, q.answerIndex, seed);
    return { ...q, options: sh.options, answerIndex: sh.answerIndex };
  };

  const [items, setItems] = useState<QuizQuestion[]>(() =>
    Array.isArray(questions) ? questions.map(shuffleForDisplay) : []
  );
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loadingAnother, setLoadingAnother] = useState(false);
  const [hardLoaded, setHardLoaded] = useState(false);
  const [version, setVersion] = useState(0); // Force re-render when questions change
  const REQUIRED_QUESTIONS = 2;
  const hasRequired = items.length >= REQUIRED_QUESTIONS;

  // Reset when subtopic questions change
  useEffect(() => {
    const processed = Array.isArray(questions)
      ? questions.map(shuffleForDisplay)
      : [];
    setItems(processed);
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
    items &&
    items.length > 0 &&
    items.every((q, i) => answers[i] === q.answerIndex);
  const twoCorrect =
    hasRequired &&
    answers[0] === items[0]?.answerIndex &&
    answers[1] === items[1]?.answerIndex;

  const firstCheckRef = useRef<{ done: boolean; wasPerfect: boolean }>({
    done: false,
    wasPerfect: false,
  });

  useEffect(() => {
    // Reset the first-check tracker whenever the question set changes
    firstCheckRef.current = { done: false, wasPerfect: false };
  }, [items.map((q) => q.id).join('|')]);

  const check = () => {
    if (!firstCheckRef.current.done) {
      const twoNow =
        items.length >= REQUIRED_QUESTIONS &&
        answers[0] === items[0]?.answerIndex &&
        answers[1] === items[1]?.answerIndex;
      firstCheckRef.current = { done: true, wasPerfect: Boolean(twoNow) };
    }
    setRevealed(true);
    // Persist attempts for the current selections at check-time (not on every click)
    try {
      if (!disablePersistence) {
        for (let i = 0; i < items.length; i++) {
          const q = items[i];
          const sel = answers[i];
          if (typeof sel === 'number' && q && q.id) {
            void fetch('/api/quiz/attempt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                questionId: q.id,
                selectedIndex: sel,
                isCorrect: sel === q.answerIndex,
              }),
            });
          }
        }
      }
    } catch {}
  };
  const tryAgain = () => setRevealed(false);

  // Optionally fetch questions from lesson content until we have REQUIRED_QUESTIONS
  useEffect(() => {
    // Delay initial question generation until the explanation is fully ready
    // to ensure richer context (parity with the "Another set" flow)
    if (!explanationReady) return;
    // Generate sequentially to avoid duplicates and race conditions
    if (hardLoaded || items.length >= REQUIRED_QUESTIONS) return;
    const lessonPayload = (lessonMd || '').trim();
    if (lessonPayload.length < 50) {
      // If no lesson content yet, retry when it arrives
      return;
    }
    // Prevent duplicate generations (e.g., StrictMode double invoke / re-mounts)
    const reserved = reserveQuestions ? reserveQuestions(subtopicId) : true;
    if (!reserved) return;

    (async () => {
      let success = false;
      try {
        const needed = Math.max(0, REQUIRED_QUESTIONS - items.length);
        if (needed === 0) {
          setHardLoaded(true);
          return;
        }

        // Request both questions in a single call when possible to reduce overlap
        const generated: Array<{
          prompt: string;
          options: string[];
          answerIndex: number;
          explanation: string;
        }> = [];
        const avoid = new Set<string>(
          (Array.isArray(items) ? items : [])
            .map((q) => q.prompt)
            .filter(Boolean)
        );
        try {
          const res = await fetch('/api/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lessonMd: lessonPayload,
              difficulty: 'hard',
              subtopicTitle,
              lectureId,
              overview,
              subtopicId,
              avoidPrompts: Array.from(avoid),
              count: Math.min(2, needed),
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              questions: Array<{
                prompt: string;
                options: string[];
                answerIndex: number;
                explanation: string;
              }>;
              debug?: any;
            };
            try {
              if (data?.debug)
                console.debug('[quiz]', { subtopicId, debug: data.debug });
            } catch {}
            for (const cand of data.questions || []) {
              const prompt = String(cand?.prompt || '').trim();
              if (
                !prompt ||
                avoid.has(prompt) ||
                generated.some((g) => g.prompt === prompt)
              )
                continue;
              generated.push(cand);
              avoid.add(prompt);
              if (generated.length >= needed) break;
            }
          }
        } catch {}

        if (generated.length) {
          if (disablePersistence) {
            // Demo: ephemeral temp IDs
            const temp = generated.map((q, idx) => ({
              ...q,
              id: `${subtopicId}-temp-${Date.now()}-${idx}`,
            })) as unknown as QuizQuestion[];
            const processed = temp.map(shuffleForDisplay);
            setItems(processed);
            setAnswers([]);
            setRevealed(false);
            setVersion((v) => v + 1);
            success = true;
          } else {
            // Persist to DB so these questions have stable IDs and survive reloads
            const save = await fetch('/api/quiz/questions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subtopicId, questions: generated }),
            });
            if (save.ok) {
              const payload = (await save.json()) as {
                questions: Array<{
                  id: string;
                  prompt: string;
                  options: string[];
                  answerIndex: number;
                  explanation: string;
                }>;
              };
              const saved = (payload.questions || []).slice(
                0,
                REQUIRED_QUESTIONS
              );
              if (saved.length) {
                const processed = saved.map(
                  shuffleForDisplay
                ) as unknown as QuizQuestion[];
                setItems(processed);
                setAnswers([]);
                setRevealed(false);
                setVersion((v) => v + 1); // Force re-render
                success = true;
                // Inform parent so future mounts use the saved questions and avoid re-generating
                try {
                  onQuestionsSaved?.(processed as unknown as QuizQuestion[]);
                } catch {}
              }
            }
            // Fallback: if not saved to DB, still show the generated questions with temporary IDs
            if (!success) {
              const temp = generated.map((q, idx) => ({
                ...q,
                id: `${subtopicId}-temp-${Date.now()}-${idx}`,
              })) as unknown as QuizQuestion[];
              const processed = temp.map(shuffleForDisplay);
              setItems(processed);
              setAnswers([]);
              setRevealed(false);
              setVersion((v) => v + 1);
              success = true;
            }
          }
        }
        // If nothing could be generated/saved, mark as loaded to avoid infinite spinner
        if (!success) {
          setHardLoaded(true);
        }
      } catch {
        // swallow
      } finally {
        setHardLoaded((prev) => prev || success);
        try {
          releaseQuestions?.(subtopicId);
        } catch {}
      }
    })();
  }, [
    explanationReady,
    lessonMd,
    hardLoaded,
    items.length,
    subtopicId,
    subtopicTitle,
    reserveQuestions,
    releaseQuestions,
    onQuestionsSaved,
  ]);

  // Quiz progress is not persisted; no restore/reset logic

  const askAnother = async () => {
    setLoadingAnother(true);
    try {
      const payload = (lessonMd || '').trim();
      if (payload.length < 50) throw new Error('lesson too short');

      // Generate sequentially, ensuring uniqueness against current items
      const generated: Array<{
        prompt: string;
        options: string[];
        answerIndex: number;
        explanation: string;
      }> = [];
      const avoid = new Set<string>(
        (Array.isArray(items) ? items : []).map((q) => q.prompt).filter(Boolean)
      );
      try {
        const res = await fetch('/api/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonMd: payload,
            difficulty: 'hard',
            subtopicTitle,
            lectureId,
            overview,
            subtopicId,
            avoidPrompts: Array.from(avoid),
            count: 2,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            questions: Array<{
              prompt: string;
              options: string[];
              answerIndex: number;
              explanation: string;
            }>;
            debug?: any;
          };
          try {
            if (data?.debug)
              console.debug('[quiz/another]', {
                subtopicId,
                debug: data.debug,
              });
          } catch {}
          for (const cand of data.questions || []) {
            const prompt = String(cand?.prompt || '').trim();
            if (
              !prompt ||
              avoid.has(prompt) ||
              generated.some((g) => g.prompt === prompt)
            )
              continue;
            generated.push(cand);
            avoid.add(prompt);
          }
        }
      } catch {}

      if (generated.length === 0) throw new Error('No questions returned');

      // Persist the newly generated set so they have stable IDs
      let saved: Array<{
        id: string;
        prompt: string;
        options: string[];
        answerIndex: number;
        explanation: string;
      }> = [];
      if (!disablePersistence) {
        try {
          const save = await fetch('/api/quiz/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subtopicId,
              questions: generated,
              replace: true,
            }),
          });
          if (save.ok) {
            const payload = (await save.json()) as {
              questions: Array<{
                id: string;
                prompt: string;
                options: string[];
                answerIndex: number;
                explanation: string;
              }>;
            };
            saved = payload.questions || [];
          }
        } catch {}
      }

      const nextItemsRaw = (saved.length > 0
        ? saved
        : generated.map((q, idx) => ({
            ...q,
            id: `${subtopicId}-temp-${Date.now()}-${idx}`,
          }))) as unknown as QuizQuestion[];
      const nextItems = nextItemsRaw.map(shuffleForDisplay);

      // Update state and ensure re-render
      setItems(nextItems);
      setAnswers([]);
      setRevealed(false);
      setVersion((v) => v + 1); // Force re-render

      // Notify parent if questions were saved
      if (!disablePersistence && saved.length > 0) {
        try {
          onQuestionsSaved?.(nextItems);
        } catch {}
      }
    } catch (_e) {
      // Do not use any fallback question variants; leave questions unchanged on failure.
    } finally {
      setLoadingAnother(false);
    }
  };
  if (items.length < REQUIRED_QUESTIONS && !hardLoaded) {
    return <p className="text-sm text-neutral-400">Preparing questions…</p>;
  }

  if (explanationReady && (!items || items.length === 0) && hardLoaded) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-400">
          No quiz questions for this subtopic.
        </p>
        <button
          onClick={askAnother}
          disabled={loadingAnother}
          className="rounded-md border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {loadingAnother ? 'Generating…' : 'Generate questions'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4" key={`quiz-${version}`}>
      <ul className="space-y-6">
        {items.map((q, i) => {
          const selected = answers[i];
          const isAllCorrect = allCorrect;
          return (
            <li key={q.id} className="space-y-3">
              <div className="chat-md font-medium text-neutral-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    em: (props) => (
                      <em className="font-semibold not-italic" {...props} />
                    ),
                  }}
                >
                  {q.prompt}
                </ReactMarkdown>
              </div>
              <div className="grid gap-2">
                {q.options.map((o, j) => {
                  const isSelected = selected === j;
                  const isCorrect = revealed && j === q.answerIndex;
                  const isIncorrect =
                    revealed && isSelected && j !== q.answerIndex;
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
                      }}
                      className={buttonClass}
                      disabled={revealed && isAllCorrect}
                    >
                      <span className="chat-md">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            // Avoid invalid block elements inside <button>
                            p: (props) => <span {...props} />,
                            em: (props) => (
                              <em
                                className="font-semibold not-italic"
                                {...props}
                              />
                            ),
                          }}
                        >
                          {stripABCD(o)}
                        </ReactMarkdown>
                      </span>
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <div className="chat-md mt-4 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
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
            disabled={
              items.length === 0 ||
              answers.length < items.length ||
              answers.some((a) => typeof a !== 'number')
            }
            className="rounded-md bg-[rgb(var(--accent))] px-5 py-2 font-semibold text-black disabled:opacity-50"
          >
            Check Answer
          </button>
        )}

        {revealed && twoCorrect && (
          <>
            <button
              onClick={() => onPassed(firstCheckRef.current.wasPerfect)}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500"
            >
              Go to next subtopic
            </button>
            <button
              onClick={askAnother}
              disabled={loadingAnother}
              className="rounded-md border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {loadingAnother ? 'Generating...' : 'Another set of questions'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
