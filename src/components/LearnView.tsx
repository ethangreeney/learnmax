'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ChatPanel from '@/components/ChatPanel';
import dynamic from 'next/dynamic';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  LockKeyhole,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { rankFromElo, rankGradient } from '@/lib/client/rank-colors';

function GeneratingOverlayFallback(props: any) {
  const visible = Boolean(props?.visible);
  const hasError = Boolean(props?.hasError);
  const ariaLabel = hasError ? 'Generation failed' : 'Generating lesson…';
  if (!visible && !hasError) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden={!visible}
    >
      <div
        className={`absolute inset-0 ${visible ? 'opacity-100' : 'opacity-0'} bg-black/60 transition-opacity duration-200`}
      />
      <div
        className={`w-[92%] max-w-[520px] rounded-xl border border-neutral-800 bg-neutral-950/70 p-5 text-neutral-200 shadow-2xl backdrop-blur-sm transition-opacity duration-200 md:p-6 ${visible ? 'opacity-100' : 'opacity-0'}`}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        {!hasError ? (
          <div className="flex flex-col items-center text-center">
            <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-2 w-1/3 animate-[bar_1.2s_ease_infinite] rounded-full bg-[rgb(var(--accent))]" />
            </div>
            <div className="mt-4 text-base font-medium">
              Preparing your lesson…
            </div>
            <div className="mt-2 text-xs text-neutral-400">
              This can take up to a minute.
            </div>
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
            <div className="text-base font-semibold text-red-300">
              Generation failed
            </div>
            <p className="mt-2 text-sm text-neutral-300">
              {props?.errorMessage || 'Something went wrong.'}
            </p>
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
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(300%);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

const GeneratingOverlay = dynamic<any>(
  () => import('@/components/GeneratingOverlay'),
  {
    ssr: false,
    loading: (props: any) => <GeneratingOverlayFallback {...props} />,
  }
);
// Delete option removed inside lesson; available on dashboard only
// Icons not needed since deletion controls were removed from this view
import {
  deriveUnlockedIndex,
  type LearnLecture,
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

  // Clean up any legacy leaked mask placeholders
  t = t
    .replace(/&lt;&lt;MD_MASK_\d+&gt;&gt;/g, '')
    .replace(/<<MD_MASK_\d+>>/g, '');
  // Remove any leaked MDMASK placeholders from prior runs BEFORE creating new masks
  t = t.replace(/%%MDMASK:\d+%%/g, '');

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

  // 4) Escape stray angle brackets outside code/math so ReactMarkdown
  //    never interprets them as HTML tags (which would drop content).
  try {
    const masks: string[] = [];
    const mask = (m: string) => {
      masks.push(m);
      return `%%MDMASK:${masks.length - 1}%%`;
    };
    // Protect code fences, math blocks, inline code, inline math, LaTeX delimiters, and leaked masks
    t = t.replace(/```[\s\S]*?```/g, mask);
    t = t.replace(/\$\$[\s\S]*?\$\$/g, mask);
    t = t.replace(/`[^`]*`/g, mask);
    t = t.replace(/(?<!\$)\$([^$\n]|[^$\n][\s\S]*?[^$\n])\$(?!\$)/g, mask);
    t = t.replace(/\\\([\s\S]*?\\\)/g, mask).replace(/\\\[[\s\S]*?\\\]/g, mask);
    // Escape remaining angle brackets
    t = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Escape stray dollar signs so remark-math doesn't start math at Qlik's $
    try {
      t = t.replace(/(?<!\\)\$/g, '\\\$');
    } catch {
      t = t.replace(/(^|[^\\])\$/g, '$1\\$');
    }
    // Restore masks
    t = t.replace(/%%MDMASK:(\d+)%%/g, (_, i) => masks[Number(i)] || '');
  } catch {}

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
      (/[\.:;!?]$/.test(previous) && isWordChar(firstChar)) ||
      // closing paren/bracket followed by a word
      (/[)\]]$/.test(previous) && isWordChar(firstChar)) ||
      // emphasis or strong markers starting at boundary
      (/[*_]$/.test(previous) && isWordChar(firstChar))) &&
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

// Ensure rendered content never starts with a duplicate title/heading
function stripLeadingTitle(md: string, title?: string): string {
  let out = String(md ?? '');
  const norm = (s: string) => s.trim();
  const same = (a: string, b: string) =>
    norm(a).localeCompare(norm(b), undefined, { sensitivity: 'accent' }) === 0;

  // Iteratively remove leading headings or exact title lines at the very start
  // to be resilient to streaming joins or minor variations.
  for (;;) {
    let changed = false;
    // ATX heading at very beginning
    const atx = out.match(/^\s{0,3}#{1,6}\s+([^\n]+)\n+/);
    if (atx) {
      const text = atx[1] || '';
      if (!title || same(text, title)) {
        out = out.slice(atx[0].length);
        changed = true;
      }
    }
    if (!changed) {
      // Setext heading at very beginning
      const setext = out.match(/^\s*([^\n]+)\n(?:=+|-+)\s*\n+/);
      if (setext) {
        const text = setext[1] || '';
        if (!title || same(text, title)) {
          out = out.slice(setext[0].length);
          changed = true;
        }
      }
    }
    if (!changed && title) {
      // Exact title as first non-empty line
      const lines = out.split('\n');
      const firstIdx = lines.findIndex((l) => l.trim() !== '');
      if (firstIdx !== -1) {
        const firstLine = lines[firstIdx].trim();
        if (same(firstLine, title)) {
          lines.splice(firstIdx, 1);
          if (lines[firstIdx] !== undefined && lines[firstIdx].trim() === '') {
            lines.splice(firstIdx, 1);
          }
          out = lines.join('\n');
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return out;
}

function formatImportanceLabel(importance?: string): string {
  const normalized = String(importance || '').toLowerCase();
  if (!normalized) return 'Medium';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDifficultyLabel(difficulty?: number): string {
  const value = Number.isFinite(difficulty as number) ? Number(difficulty) : 2;
  if (value <= 1) return 'Low';
  if (value >= 3) return 'High';
  return 'Medium';
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
  // UI-only store per page mount. To avoid hydration mismatches, seed with
  // server-stable values only; restore localStorage progress after mount.
  const initialUnlocked = deriveUnlockedIndex(initial.subtopics);
  const initialCurrentFromStorage = initialUnlocked;
  const initialUnlockedFromStorage = initialUnlocked;
  const storeRef = useRef(
    createLearnUIStore({
      currentIndex: initialCurrentFromStorage,
      unlockedIndex: initialUnlockedFromStorage,
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

  // Track progress restoration and pending scroll position
  const restoringIndexRef = useRef<boolean>(false);
  const restoredScrollRef = useRef<boolean>(false);
  const pendingScrollYRef = useRef<number | null>(null);
  const pendingSubtopicIdRef = useRef<string | null>(null);

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
  // Track the first subtopic so we can hide the overlay when its content is ready
  const firstSubtopicIdRef = useRef<string | null>(
    initial.subtopics?.[0]?.id || null
  );
  const overlayHiddenRef = useRef<boolean>(false);

  // Subtopics Show/Hide state (default: expanded)
  const [subtopicsCollapsed, setSubtopicsCollapsed] = useState<boolean>(false);
  const hasAnySubtopics = (initial.subtopics?.length ?? 0) > 0;
  const subtopicsContainerId = useMemo(
    () => `subtopics-container-${initial.id}` as const,
    [initial.id]
  );
  const onToggleSubtopics = useCallback(() => {
    const next = !subtopicsCollapsed;
    setSubtopicsCollapsed(next);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          'subtopicsCollapsed',
          next ? 'true' : 'false'
        );
      }
    } catch {}
    // Optional analytics without relying on postTelemetry ordering
    try {
      void fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'subtopics_toggle',
          lectureId: initial.id,
          ts: Date.now(),
          state: next ? 'collapsed' : 'expanded',
        }),
      });
    } catch {}
  }, [subtopicsCollapsed, initial.id]);

  // Restore persisted state after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('subtopicsCollapsed');
        if (raw !== null) setSubtopicsCollapsed(raw === 'true');
      }
    } catch {}
  }, []);

  // Cleanup: abort any active streams on unmount
  useEffect(() => {
    const explanationControllers = explainControllersRef.current;
    const explanationRunIds = explainRunIdRef.current;
    return () => {
      try {
        if (abortRef.current) abortRef.current.abort();
      } catch {}
      try {
        for (const [, ctl] of explanationControllers) ctl.abort();
      } catch {}
      explanationControllers.clear();
      explanationRunIds.clear();
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

  // Persist shallow progress (furthest visited index) locally so users can resume even without mastery
  useEffect(() => {
    try {
      const key = `lesson:progress:${initial.id}`;
      const raw =
        typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw || '{}');
        const savedCurrent = Number(parsed?.currentIndex ?? 0);
        const savedUnlocked = Number(parsed?.unlockedIndex ?? 0);
        const savedScrollY = Number(parsed?.scrollY ?? 0);
        const maxIdx = Math.max(0, initial.subtopics.length - 1);
        const nextCurrent = Math.max(
          0,
          Math.min(maxIdx, Number.isFinite(savedCurrent) ? savedCurrent : 0)
        );
        const nextUnlocked = Math.max(
          0,
          Math.min(maxIdx, Number.isFinite(savedUnlocked) ? savedUnlocked : 0)
        );
        if (Number.isFinite(savedScrollY) && savedScrollY > 0) {
          pendingScrollYRef.current = Math.max(0, Math.trunc(savedScrollY));
        } else {
          pendingScrollYRef.current = null;
        }
        restoringIndexRef.current = true;
        ui.setState((s) => ({
          ...s,
          currentIndex: Math.max(0, Math.min(maxIdx, nextCurrent)),
          unlockedIndex: Math.max(s.unlockedIndex, nextUnlocked),
        }));
        // Remember which subtopic ID we are restoring to, so we can apply the scroll when that subtopic becomes active
        try {
          const idx = Math.max(0, Math.min(maxIdx, nextCurrent));
          pendingSubtopicIdRef.current = initial.subtopics[idx]?.id || null;
        } catch {
          pendingSubtopicIdRef.current = null;
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      // Restore progress after mount to avoid SSR/CSR mismatches
      const key = `lesson:progress:${initial.id}`;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw || '{}');
        const savedCurrent = Number(parsed?.currentIndex ?? NaN);
        const savedUnlocked = Number(parsed?.unlockedIndex ?? NaN);
        const maxIdx = Math.max(0, initial.subtopics.length - 1);
        const clamp = (v: number) =>
          Math.max(0, Math.min(maxIdx, Math.trunc(v)));
        const nextCurrent = Number.isFinite(savedCurrent)
          ? clamp(savedCurrent)
          : ui.getState().currentIndex;
        const nextUnlocked = Number.isFinite(savedUnlocked)
          ? Math.max(
              deriveUnlockedIndex(initial.subtopics),
              clamp(savedUnlocked),
              nextCurrent
            )
          : ui.getState().unlockedIndex;
        ui.setState((s) => ({
          ...s,
          currentIndex: nextCurrent,
          unlockedIndex: nextUnlocked,
        }));
        // Remember pending scroll if present
        const savedScrollY = Number(parsed?.scrollY ?? NaN);
        if (Number.isFinite(savedScrollY) && savedScrollY > 0)
          pendingScrollYRef.current = Math.max(0, Math.trunc(savedScrollY));
        restoringIndexRef.current = true;
        try {
          const idx = Math.max(0, Math.min(maxIdx, nextCurrent));
          pendingSubtopicIdRef.current = initial.subtopics[idx]?.id || null;
        } catch {
          pendingSubtopicIdRef.current = null;
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const key = `lesson:progress:${initial.id}`;
      const payload = {
        currentIndex,
        unlockedIndex,
        scrollY: window.scrollY,
        ts: Date.now(),
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {}
  }, [currentIndex, unlockedIndex, initial.id]);

  // Seed base ELO for toast animation to sync with navbar counter (skip in demo)
  useEffect(() => {
    if (demo) {
      eloBaseRef.current = 0;
      return;
    }
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
  }, [demo]);

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
        if (
          delta === lastToastDeltaRef.current &&
          now - lastToastAtRef.current < 250
        ) {
          return;
        }
        lastToastDeltaRef.current = delta;
        lastToastAtRef.current = now;

        const base = eloBaseRef.current ?? 0;
        const from = base;
        const to = base + delta;
        eloBaseRef.current = to;
        setEloToastFrom(Math.max(0, from));
        setEloToastTo(Math.max(0, to));
        setShowEloToast(true);
        if (typeof window !== 'undefined') {
          if (eloToastTimerRef.current)
            window.clearTimeout(eloToastTimerRef.current);
          eloToastTimerRef.current = window.setTimeout(
            () => setShowEloToast(false),
            1500
          );
        }
      } catch {}
    };
    window.addEventListener('elo:delta', onDelta as EventListener);
    return () => {
      window.removeEventListener('elo:delta', onDelta as EventListener);
      try {
        if (eloToastTimerRef.current)
          window.clearTimeout(eloToastTimerRef.current);
      } catch {}
    };
  }, []);

  function EloToast({ from, to }: { from: number; to: number }) {
    const [displayed, setDisplayed] = useState<number>(from);
    const [glow, setGlow] = useState<boolean>(false);
    const animFrameRef = useRef<number | null>(null);
    const animStartRef = useRef<number>(0);
    const animFromRef = useRef<number>(from);
    const animToRef = useRef<number>(to);

    const DURATION_MS = 700;

    const stopAnim = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const step = () => {
      const t = performance.now ? performance.now() : Date.now();
      const elapsed = Math.max(
        0,
        Math.min(DURATION_MS, t - animStartRef.current)
      );
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
          animStartRef.current = performance.now
            ? performance.now()
            : Date.now();
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          stopAnim();
          setDisplayed(animToRef.current);
        }
      }
    };

    useEffect(() => {
      // Initial kick-off
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
      const now = performance.now ? performance.now() : Date.now();
      // Compute instantaneous displayed value as new from-base
      if (animFrameRef.current !== null) {
        const elapsed = Math.max(
          0,
          Math.min(DURATION_MS, now - animStartRef.current)
        );
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
          (glow
            ? 'shadow-[0_0_24px_rgba(34,197,94,0.35)] ring-1 ring-green-500/30'
            : '')
        }
        role="status"
        aria-label={`ELO ${to}`}
        aria-live="polite"
      >
        <span
          className={`bg-gradient-to-r ${grad} rank-shimmer rank-contrast bg-clip-text text-transparent`}
        >
          ELO
        </span>
        <span
          className={`bg-gradient-to-r ${grad} rank-shimmer rank-contrast bg-clip-text font-semibold text-transparent tabular-nums`}
        >
          {displayed}
        </span>
        {glow && (
          <ArrowUpRight className="h-3.5 w-3.5 text-green-400" aria-hidden />
        )}
      </div>
    );
  }

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

  // Hide the generation overlay only when the first subtopic's content is actually ready
  useEffect(() => {
    if (overlayHiddenRef.current) return;
    const firstId =
      firstSubtopicIdRef.current ||
      initial.subtopics?.[0]?.id ||
      Object.keys(explanations)[0] ||
      null;
    if (!firstId) return;
    firstSubtopicIdRef.current = firstId;
    const candidateIds = Array.from(
      new Set(
        [
          firstId,
          initial.subtopics?.[0]?.id,
          ...Object.keys(explanations),
        ].filter(Boolean) as string[]
      )
    );
    const hasRenderableSection = candidateIds.some((id) => {
      const md = stripLeadingTitle(explanations[id] || '').trim();
      return Boolean(explanationDone[id]) || md.length >= 50;
    });
    if (hasRenderableSection) {
      overlayHiddenRef.current = true;
      setGenVisible(false);
      setGenHasError(false);
    }
  }, [explanations, explanationDone, initial.subtopics]);

  // TTS removed

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
            postTelemetry('gen_overlay_ttfb', {
              ms: Math.max(0, Math.round(dt)),
            });
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
            if (firstSubtopicIdRef.current === null) {
              firstSubtopicIdRef.current = s.id;
            }
            ui.setState((st) => ({
              ...st,
              currentIndex: st.currentIndex,
              unlockedIndex: Math.max(st.unlockedIndex, st.currentIndex),
            }));
            setExplanations((e) => ({ ...e, [s.id]: s.explanation || '' }));
            if (String(s.explanation || '').trim().length >= 50) {
              setExplanationDone((done) => ({ ...done, [s.id]: true }));
            }
          } else if (
            payload?.type === 'title' &&
            typeof payload.title === 'string'
          ) {
            setTitle(String(payload.title));
          } else if (payload?.type === 'done') {
            // finished initial stream
          } else if (payload?.type === 'error') {
            throw new Error(payload?.error || 'stream error');
          }
        }
      }
      const totalMs = Math.max(
        0,
        Date.now() - (genStartAtRef.current || Date.now())
      );
      postTelemetry('gen_total_wait', { ms: totalMs });
      // Do not hide overlay yet; wait until first subtopic's explanation is ready
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
  }, [
    readonly,
    streaming,
    initial.id,
    initial.subtopics,
    ui,
    setExplanations,
    postTelemetry,
  ]);

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
  const goToSubtopic = (index: number) => {
    if (!canSelect(index) || index === currentIndex) return;
    ui.setState({ currentIndex: index });
  };

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
      const explanation = stripLeadingTitle(explanationRaw).trim();
      const parts: string[] = [];
      if (title) parts.push(`# ${title}`);
      if (overview) parts.push(overview);
      if (explanation) parts.push(explanation);
      return parts.join('\n\n').trim();
    } catch {
      return '';
    }
  }, [currentSubtopic, explanations]);

  // Keep unlockedIndex sane if server state changes, but do not override a restored currentIndex on initial mount
  const didApplyServerSyncRef = useRef<boolean>(false);
  useEffect(() => {
    const u = deriveUnlockedIndex(initial.subtopics);
    ui.setState((s) => {
      const next = {
        ...s,
        unlockedIndex: Math.max(u, s.unlockedIndex),
      } as any;
      // Only clamp currentIndex to bounds; do not force it to derived index
      next.currentIndex = Math.max(
        0,
        Math.min(s.currentIndex, initial.subtopics.length - 1)
      );
      return next;
    });
    didApplyServerSyncRef.current = true;
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
        // Buffer small initial chunks to avoid showing just a heading/one-liner
        let firstBuf = '';
        // Accumulate the full text for a reliable final flush on 'done'
        let fullAgg = '';
        const MIN_FIRST_CHARS = 120;
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
                fullAgg = appendChunkSafely(fullAgg, delta);
                // Accumulate small initial chunks before first paint
                if (!started) {
                  firstBuf = appendChunkSafely(firstBuf, delta);
                  const readyToFlush =
                    firstBuf.length >= MIN_FIRST_CHARS || /\n/.test(firstBuf);
                  if (readyToFlush) {
                    started = true;
                    const initialOut = sanitizeMarkdown(firstBuf);
                    setExplanations((e) => ({ ...e, [targetId]: initialOut }));
                  }
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
                // If nothing flushed yet (single-chunk stream or very small first chunk), ensure we paint final content
                if (!started && firstBuf.trim()) {
                  const finalOut = sanitizeMarkdown(firstBuf);
                  setExplanations((e) => ({ ...e, [targetId]: finalOut }));
                  started = true;
                }
                // If we accumulated full output, ensure final state reflects it
                if (fullAgg && fullAgg.trim()) {
                  const finalOut = sanitizeMarkdown(fullAgg);
                  setExplanations((e) => {
                    const existing = String(e[targetId] || '');
                    return existing.length >= finalOut.length
                      ? e
                      : { ...e, [targetId]: finalOut };
                  });
                }
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
      currentIndex,
      reserveExplanation,
      releaseExplanation,
      ui,
    ]
  );

  // Convenience wrapper removed along with style selection UI

  // Remove previously-deferred first-subtopic auto-regeneration to avoid
  // accidental double streams on mount.

  // On subtopic change: fetch explanation once and scroll appropriately
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
    // TTS removed
    if (s) {
      const isRestoringSubtopic =
        restoringIndexRef.current && pendingSubtopicIdRef.current === s.id;
      // If we're restoring and the correct subtopic is active, perform the saved scroll once
      if (
        !restoredScrollRef.current &&
        isRestoringSubtopic &&
        pendingScrollYRef.current !== null
      ) {
        const y = Math.max(0, pendingScrollYRef.current);
        pendingScrollYRef.current = null;
        restoringIndexRef.current = false;
        if (typeof window !== 'undefined') {
          const doScroll = () => {
            try {
              window.scrollTo({ top: y, behavior: 'auto' });
              restoredScrollRef.current = true;
            } catch {
              restoredScrollRef.current = true;
            }
          };
          if (typeof requestAnimationFrame !== 'undefined')
            requestAnimationFrame(doScroll);
          else doScroll();
        }
      } else {
        // Normal behavior: scroll the main panel to top on subtopic change
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => scrollToMainTop());
        } else {
          scrollToMainTop();
        }
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

            // Prefetch short-answer question for the next subtopic once content is ready
            try {
              const prefLectureId = initial.id;
              const prefSubtopicId = next.id;
              // First try to restore an existing saved question
              const prev = await fetch(
                `/api/revise/short?lectureId=${encodeURIComponent(prefLectureId)}&subtopicId=${encodeURIComponent(prefSubtopicId)}`
              );
              let havePrompt = false;
              if (prev.ok) {
                try {
                  const data = (await prev.json()) as any;
                  const p = String(data?.prompt || '').trim();
                  havePrompt = Boolean(p);
                } catch {}
              }
              if (!havePrompt) {
                // Generate a new short-answer question grounded in the prefetched content
                const gen = await fetch('/api/revise/generate-one', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    lessonMd: md,
                    // Keep title omitted to mirror in-session generation behavior
                  }),
                });
                if (gen.ok) {
                  const data = (await gen.json().catch(() => ({}))) as {
                    prompt?: string;
                    modelAnswer?: string;
                  };
                  const q = String(data?.prompt || '').trim();
                  if (q) {
                    try {
                      await fetch('/api/revise/short', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          lectureId: prefLectureId,
                          subtopicId: prefSubtopicId,
                          prompt: q,
                          modelAnswer: String(data?.modelAnswer || ''),
                        }),
                      });
                    } catch {}
                  }
                }
              }
            } catch {}

            if (reservedExplain) releaseExplanation(next.id);
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

  const activeExplanation = currentSubtopic
    ? stripLeadingTitle(explanations[currentSubtopic.id] || '').trim()
    : '';
  const activeExplanationFailed = activeExplanation.startsWith(
    'Could not generate explanation.'
  );
  const activeExplanationReady = currentSubtopic
    ? Boolean(explanationDone[currentSubtopic.id])
    : false;
  const currentIsMastered = currentSubtopic
    ? countedIdsRef.current.has(currentSubtopic.id)
    : false;

  return (
    <div className="grid grid-cols-1 gap-8 px-2 md:px-4 lg:grid-cols-12 lg:gap-7 xl:gap-9">
      {/* Left: Outline */}
      <aside
        className="space-y-5 self-start rounded-xl border border-neutral-800 bg-neutral-950/40 p-5 lg:sticky lg:top-24 lg:col-span-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:p-6 xl:col-span-3"
        data-tour="outline"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium tracking-[0.16em] text-neutral-500 uppercase">
              Lesson
            </div>
            <h2 className="mt-1 text-lg leading-snug font-semibold break-words">
              {title}
            </h2>
          </div>
          {hasAnySubtopics && (
            <button
              type="button"
              onClick={onToggleSubtopics}
              aria-expanded={!subtopicsCollapsed}
              aria-controls={subtopicsContainerId}
              title={subtopicsCollapsed ? 'Show subtopics' : 'Hide subtopics'}
              aria-label={
                subtopicsCollapsed ? 'Show subtopics' : 'Hide subtopics'
              }
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] leading-none text-neutral-200 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--accent))]"
            >
              <span>{subtopicsCollapsed ? 'Show' : 'Hide'}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${subtopicsCollapsed ? '-rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div
          className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
          data-tour="progress"
        >
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
            <span>Mastery</span>
            <span className="font-medium text-neutral-200">
              {masteredCount} of {totalCount}
            </span>
          </div>

          {/* Bar + non-clipped glow */}
          <div className="relative">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
              role="progressbar"
              aria-label="Lesson mastery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPctSafe}
            >
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
          <div className="mt-2 text-[11px] text-neutral-500">
            {progressPctSafe === 100
              ? 'Lesson complete'
              : `${progressPctSafe}% complete · Section ${Math.min(currentIndex + 1, Math.max(1, totalCount))} of ${totalCount}`}
          </div>
        </div>

        {/* Share controls removed from lesson page; available in Learn Workspace only */}

        {/* Deletion is managed on the dashboard; no delete button here */}

        {/* No deletion error state in lesson view */}

        <div id={subtopicsContainerId} hidden={subtopicsCollapsed}>
          <ul className="space-y-1.5" aria-label="Lesson sections">
            {initial.subtopics.map((s, i) => {
              const isMastered = countedIdsRef.current.has(s.id);
              const isLocked = i > unlockedIndex;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goToSubtopic(i)}
                    disabled={isLocked}
                    aria-current={i === currentIndex ? 'step' : undefined}
                    title={
                      isLocked
                        ? 'Complete the previous section to unlock'
                        : s.title
                    }
                    className={`group flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm leading-snug transition-colors ${
                      isLocked
                        ? 'cursor-not-allowed border-transparent text-neutral-600'
                        : i === currentIndex
                          ? 'border-neutral-700 bg-neutral-800 font-semibold text-white'
                          : 'border-transparent text-neutral-300 hover:border-neutral-800 hover:bg-neutral-900'
                    }`}
                  >
                    <span
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center"
                      aria-hidden="true"
                    >
                      {isMastered ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                      ) : isLocked ? (
                        <LockKeyhole className="h-4 w-4" />
                      ) : (
                        <Circle
                          className={`h-4 w-4 ${i === currentIndex ? 'fill-[rgb(var(--accent))] text-[rgb(var(--accent))]' : ''}`}
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-medium tracking-[0.12em] text-neutral-500 uppercase">
                        Section {i + 1}
                      </span>
                      <span className="mt-0.5 block">{s.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Center: Explanation + Quiz */}
      <section
        ref={mainRef}
        className={`relative lg:col-span-8 xl:col-span-6 ${readonly ? 'lg:col-span-8 xl:col-span-9' : ''}`}
        aria-busy={genVisible ? true : undefined}
        aria-label="Lesson content"
      >
        {showEloToast && eloToastFrom !== null && eloToastTo !== null && (
          <div className="pointer-events-none absolute top-0 right-0 z-20 p-2 md:p-3">
            <div className="pointer-events-auto">
              <EloToast from={eloToastFrom} to={eloToastTo} />
            </div>
          </div>
        )}
        {showSparkle && (
          <div
            className="pointer-events-none fixed top-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-emerald-950/95 px-4 py-2.5 text-sm font-semibold text-emerald-100 shadow-2xl"
            role="status"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles
                className="h-4 w-4 text-emerald-300"
                aria-hidden="true"
              />
              Lesson complete
            </span>
          </div>
        )}
        {currentSubtopic ? (
          <div className="space-y-8">
            <div className="card p-6 md:p-8 xl:p-10" data-tour="content-pane">
              <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-4">
                <div className="text-xs font-medium tracking-[0.14em] text-neutral-500 uppercase">
                  Section {currentIndex + 1} of {totalCount}
                </div>
                <nav
                  className="flex items-center gap-2"
                  aria-label="Section navigation"
                >
                  <button
                    type="button"
                    onClick={() => goToSubtopic(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    aria-label="Previous section"
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goToSubtopic(currentIndex + 1)}
                    disabled={
                      currentIndex >= unlockedIndex ||
                      currentIndex >= totalCount - 1
                    }
                    aria-label={
                      currentIndex >= unlockedIndex
                        ? 'Complete the mastery check to unlock the next section'
                        : 'Next section'
                    }
                    title={
                      currentIndex >= unlockedIndex &&
                      currentIndex < totalCount - 1
                        ? 'Complete the mastery check to unlock the next section'
                        : undefined
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <span className="hidden sm:inline">Next</span>
                    {currentIndex >= unlockedIndex &&
                    currentIndex < totalCount - 1 ? (
                      <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </nav>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-3xl font-bold tracking-tight">
                    {currentSubtopic.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-300">
                    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1">
                      {formatImportanceLabel(currentSubtopic.importance)}{' '}
                      importance
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1">
                      {formatDifficultyLabel(currentSubtopic.difficulty)}{' '}
                      difficulty
                    </span>
                    {currentIsMastered && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/40 px-2.5 py-1 text-emerald-300">
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        Mastered
                      </span>
                    )}
                  </div>
                </div>
                {!activeExplanationReady && !activeExplanationFailed && (
                  <div
                    className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400"
                    role="status"
                  >
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--accent))]"
                      aria-hidden="true"
                    />
                    Building section…
                  </div>
                )}
              </div>
              {/* TTS UI removed */}
              {!readonly && !demo && <hr className="my-6 border-neutral-800" />}
              {activeExplanationFailed ? (
                <div
                  className="rounded-lg border border-red-900/70 bg-red-950/20 p-5"
                  role="alert"
                >
                  <div className="font-medium text-red-200">
                    This section did not load
                  </div>
                  <p className="mt-1 text-sm text-neutral-400">
                    Your progress is safe. Retry the section without leaving the
                    lesson.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setExplanations((current) => ({
                        ...current,
                        [currentSubtopic.id]: '',
                      }));
                      setExplanationDone((current) => ({
                        ...current,
                        [currentSubtopic.id]: false,
                      }));
                      void fetchExplanationFor(currentSubtopic, 'default');
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Retry section
                  </button>
                </div>
              ) : activeExplanation ? (
                <div
                  id="lesson-markdown"
                  data-lesson="markdown"
                  className="markdown"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {activeExplanation}
                  </ReactMarkdown>
                </div>
              ) : (
                <div
                  className="space-y-3 py-2"
                  role="status"
                  aria-label="Preparing this lesson section"
                >
                  <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-800" />
                  <div className="h-4 w-full animate-pulse rounded bg-neutral-800" />
                  <div className="h-4 w-4/6 animate-pulse rounded bg-neutral-800" />
                </div>
              )}
            </div>

            {!readonly &&
              (() => {
                const lessonMd = stripLeadingTitle(
                  explanations[currentSubtopic.id] || ''
                ).trim();
                const hasLesson = lessonMd.length >= 50;
                return (
                  <div
                    className="quiz-panel card p-6 md:p-8 xl:p-10"
                    data-tour="quiz-panel"
                  >
                    <h3 className="mb-6 text-2xl font-bold tracking-tight">
                      Mastery Check
                    </h3>
                    <p className="-mt-3 mb-6 text-sm text-neutral-400">
                      Explain the idea in your own words. Score 8/10 or higher
                      to unlock the next section.
                    </p>
                    {!hasLesson && (
                      <p className="mb-4 text-sm text-neutral-400">
                        Waiting for the lesson to finish… quiz will be prepared
                        right after.
                      </p>
                    )}
                    <ShortAnswerPanel
                      key={currentSubtopic.id}
                      subtopicId={currentSubtopic.id}
                      explanationReady={Boolean(
                        explanationDone[currentSubtopic.id]
                      )}
                      lectureId={initial.id}
                      lessonMd={lessonMd}
                      isLast={currentIndex === initial.subtopics.length - 1}
                      onPassed={async () => {
                        const id = currentSubtopic.id;
                        const isLast =
                          currentIndex === initial.subtopics.length - 1;

                        // The server verifies ownership and the saved passing grade.
                        // Never unlock locally until that confirmation succeeds.
                        if (!demo) {
                          let res: Response;
                          try {
                            res = await fetch('/api/mastery', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ subtopicId: id }),
                            });
                          } catch {
                            throw new Error(
                              'Progress could not be saved. Check your connection and try again.'
                            );
                          }
                          const data = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            error?: string;
                            eloDelta?: number;
                          };
                          if (!res.ok || !data?.ok) {
                            throw new Error(
                              data?.error ||
                                'Progress could not be saved. Please try again.'
                            );
                          }
                          const delta = Number(data.eloDelta ?? 0);
                          try {
                            if (Number.isFinite(delta) && delta > 0) {
                              window.dispatchEvent(
                                new CustomEvent('elo:delta', {
                                  detail: { delta: Math.trunc(delta) },
                                })
                              );
                            } else {
                              window.dispatchEvent(
                                new Event('elo:maybeRefresh')
                              );
                            }
                          } catch {}
                        }

                        if (!countedIdsRef.current.has(id)) {
                          countedIdsRef.current.add(id);
                          setMasteredCount((count) =>
                            Math.min(totalCount, count + 1)
                          );
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
                        // Advance only after the server has confirmed mastery.
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
      </section>

      {/* Right: AI Tutor */}
      {!readonly && (
        <aside
          className="h-[38rem] self-start lg:col-span-12 xl:sticky xl:top-24 xl:col-span-3 xl:h-[calc(100vh-8rem)]"
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
              const ok =
                typeof window !== 'undefined'
                  ? window.confirm('Cancel generation?')
                  : true;
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
            <div className="text-sm">
              Generating your lesson… This can take up to a minute.
            </div>
          </div>
        </div>
      </noscript>
    </div>
  );
}

/* --------------------------- ShortAnswerPanel ----------------------------- */

function ShortAnswerPanel({
  subtopicId,
  explanationReady,
  lectureId,
  lessonMd,
  isLast,
  onPassed,
}: {
  subtopicId: string;
  explanationReady: boolean;
  lectureId: string;
  lessonMd?: string;
  isLast: boolean;
  onPassed: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState<string>('');
  const [modelAnswer, setModelAnswer] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [score, setScore] = useState<number | null>(null);
  const [gradedAnswer, setGradedAnswer] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [grading, setGrading] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  // Generate or restore a single short-answer prompt grounded in the current lesson
  useEffect(() => {
    const load = async () => {
      const payload = (lessonMd || '').trim();
      if (!explanationReady || payload.length < 50) {
        setLoaded(false);
        return;
      }
      try {
        setError(null);
        setLoaded(false);
        // Local ephemeral cache key (for signed-out stability)
        const cacheKey = `sap:${lectureId}:${subtopicId}`;
        let localQuestion: {
          prompt: string;
          modelAnswer: string;
          feedback: string;
        } | null = null;
        try {
          const raw =
            typeof window !== 'undefined'
              ? window.localStorage.getItem(cacheKey)
              : null;
          if (raw) {
            const j = JSON.parse(raw || '{}');
            const pLocal = sanitizeMarkdown(String(j?.prompt || '').trim());
            if (pLocal) {
              localQuestion = {
                prompt: pLocal,
                modelAnswer: sanitizeMarkdown(String(j?.modelAnswer || '')),
                feedback: sanitizeMarkdown(String(j?.feedback || '')),
              };
            }
          }
        } catch {}
        // Prefer the server copy so signed-in users also recover their answer and score.
        const prev = await fetch(
          `/api/revise/short?lectureId=${encodeURIComponent(lectureId)}&subtopicId=${encodeURIComponent(subtopicId)}`
        );
        if (prev.ok) {
          const data = (await prev.json().catch(() => ({}))) as any;
          const p = sanitizeMarkdown(String(data?.prompt || '').trim());
          if (p) {
            setPrompt(p);
            // Restore prior answer and score if available so the text box retains user input
            if (typeof data?.answer === 'string' && data?.answer.trim()) {
              setAnswer(String(data.answer));
            }
            if (typeof data?.score === 'number') {
              setScore(Math.max(0, Math.min(10, Number(data.score))));
              if (typeof data?.answer === 'string') {
                setGradedAnswer(String(data.answer).trim());
              }
              if (
                typeof data?.modelAnswer === 'string' &&
                data.modelAnswer.trim()
              ) {
                setModelAnswer(sanitizeMarkdown(String(data.modelAnswer)));
              }
            }
            if (typeof data?.feedback === 'string' && data?.feedback.trim()) {
              setFeedback(sanitizeMarkdown(String(data.feedback)));
            }
            // Do not reveal model answer until graded in-session
            try {
              const ma = sanitizeMarkdown(String(data?.modelAnswer || ''));
              const fb =
                typeof data?.feedback === 'string'
                  ? sanitizeMarkdown(String(data.feedback))
                  : '';
              const toSave = JSON.stringify({
                prompt: p,
                modelAnswer: ma,
                feedback: fb,
              });
              if (typeof window !== 'undefined')
                window.localStorage.setItem(cacheKey, toSave);
            } catch {}
            setLoaded(true);
            return;
          }
        }
        if (localQuestion) {
          setPrompt(localQuestion.prompt);
          if (localQuestion.modelAnswer)
            setModelAnswer(localQuestion.modelAnswer);
          if (localQuestion.feedback) setFeedback(localQuestion.feedback);
          setLoaded(true);
          return;
        }
        // Otherwise, generate a new one
        const res = await fetch('/api/revise/generate-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonMd: payload,
            subtopicTitle: subtopicId ? undefined : undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to generate');
        const data = (await res.json().catch(() => ({}))) as {
          prompt?: string;
          modelAnswer?: string;
        };
        const q = sanitizeMarkdown(String(data?.prompt || '').trim());
        if (!q) throw new Error('No question was returned');
        setPrompt(q);
        setModelAnswer(sanitizeMarkdown(String(data?.modelAnswer || '')));
        try {
          const toSave = JSON.stringify({
            prompt: q,
            modelAnswer: sanitizeMarkdown(String(data?.modelAnswer || '')),
            feedback: '',
          });
          if (typeof window !== 'undefined')
            window.localStorage.setItem(cacheKey, toSave);
        } catch {}
        // Persist the generated prompt so it survives reloads/sessions
        try {
          await fetch('/api/revise/short', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lectureId,
              subtopicId,
              prompt: q,
              modelAnswer: sanitizeMarkdown(String(data?.modelAnswer || '')),
            }),
          });
        } catch {}
      } catch (e: any) {
        setError(e?.message || 'Failed to prepare question');
      } finally {
        setLoaded(true);
      }
    };
    void load();
  }, [explanationReady, lessonMd, lectureId, subtopicId, retryNonce]);

  // Autosave the user's answer as they type so it restores when returning
  useEffect(() => {
    if (!prompt) return;
    const a = String(answer || '').trim();
    const payload = {
      lectureId,
      subtopicId,
      prompt,
      modelAnswer,
      answer: a,
    } as any;
    const save = () => {
      try {
        void fetch('/api/revise/short', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {}
    };
    const t = setTimeout(save, 600);
    return () => clearTimeout(t);
  }, [lectureId, subtopicId, prompt, answer, modelAnswer]);

  const submit = async () => {
    const a = (answer || '').trim();
    if (!a || !prompt) return;
    setError(null);
    setAdvanceError(null);
    setGrading(true);
    try {
      const res = await fetch('/api/revise/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Allow server to award elo when appropriate
        body: JSON.stringify({
          lectureId,
          prompt,
          answer: a,
          suppressElo: true,
          lessonMd,
        }),
      });
      if (!res.ok) throw new Error('Failed to grade');
      const data = (await res.json()) as {
        score: number;
        modelAnswer?: string;
        feedback?: string;
        eloDelta?: number;
      };
      const s = Math.max(0, Math.min(10, Number(data?.score)));
      setScore(Number.isFinite(s) ? s : 0);
      setGradedAnswer(a);
      const nextModelAnswer = data?.modelAnswer
        ? sanitizeMarkdown(String(data.modelAnswer))
        : modelAnswer;
      const nextFeedback =
        typeof data?.feedback === 'string'
          ? sanitizeMarkdown(String(data.feedback))
          : feedback;
      if (nextModelAnswer) setModelAnswer(nextModelAnswer);
      setFeedback(nextFeedback);
      // Fire ELO UI update if server awarded points
      try {
        const delta = Number(data?.eloDelta ?? 0);
        if (Number.isFinite(delta) && delta > 0) {
          window.dispatchEvent(
            new CustomEvent('elo:delta', {
              detail: { delta: Math.trunc(delta) },
            })
          );
          window.dispatchEvent(new Event('elo:maybeRefresh'));
        }
      } catch {}
      // Persist the answer + score so the user resumes where they left off
      try {
        await fetch('/api/revise/short', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lectureId,
            subtopicId,
            prompt,
            modelAnswer: nextModelAnswer,
            answer: a,
            score: s,
            feedback: nextFeedback,
          }),
        });
      } catch {}
    } catch (e: any) {
      setError(e?.message || 'Grading failed');
    } finally {
      setGrading(false);
    }
  };

  // More lenient pass threshold (> 7)
  const answerChangedSinceGrade =
    typeof score === 'number' &&
    Boolean(gradedAnswer) &&
    answer.trim() !== gradedAnswer;
  const canAdvance =
    typeof score === 'number' &&
    score >= 8 &&
    Boolean(answer.trim()) &&
    !answerChangedSinceGrade;
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const answerId = `mastery-answer-${subtopicId}`;
  const answerHintId = `mastery-answer-hint-${subtopicId}`;

  const continueAfterMastery = async () => {
    if (!canAdvance || advancing) return;
    setAdvancing(true);
    setAdvanceError(null);
    try {
      await onPassed();
    } catch (caught: any) {
      setAdvanceError(
        caught?.message ||
          'Progress could not be saved. Your answer is safe—please try again.'
      );
    } finally {
      setAdvancing(false);
    }
  };

  if (!loaded) {
    return (
      <div
        className="space-y-3"
        role="status"
        aria-label="Preparing mastery question"
      >
        <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-800" />
        <div className="h-24 w-full animate-pulse rounded-lg bg-neutral-900" />
      </div>
    );
  }
  if (!prompt) {
    return (
      <div
        className="rounded-lg border border-amber-900/70 bg-amber-950/20 p-4"
        role="alert"
      >
        <p className="text-sm font-medium text-amber-100">
          The mastery question did not load.
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          Your lesson progress is safe. Try preparing the question again.
        </p>
        <button
          type="button"
          onClick={() => setRetryNonce((value) => value + 1)}
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Retry question
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-md border border-red-900/70 bg-red-950/20 p-3 text-sm text-red-200"
          role="alert"
        >
          {error === 'Grading failed' || error === 'Failed to grade'
            ? 'Your answer could not be graded. It is still here—please try again.'
            : 'The mastery check ran into a problem. Please try again.'}
        </div>
      )}
      <div className="chat-md font-medium text-neutral-200">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {prompt}
        </ReactMarkdown>
      </div>
      <label
        htmlFor={answerId}
        className="block text-sm font-medium text-neutral-300"
      >
        Your answer
      </label>
      <textarea
        id={answerId}
        aria-describedby={answerHintId}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-sm leading-relaxed transition-colors outline-none placeholder:text-neutral-500 focus:border-[rgb(var(--accent))] focus:ring-2 focus:ring-[rgba(var(--accent),0.2)]"
        rows={5}
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          setAdvanceError(null);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Write your answer…"
        disabled={advancing}
      />
      <div
        id={answerHintId}
        className="flex items-center justify-between gap-3 text-xs text-neutral-500"
      >
        <span>Use your own words. ⌘/Ctrl + Enter to submit.</span>
        <span>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={grading || advancing || !answer.trim()}
          className="rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {grading
            ? 'Grading answer…'
            : typeof score === 'number'
              ? 'Grade revised answer'
              : 'Grade my answer'}
        </button>
      </div>
      {typeof score === 'number' && (
        <div
          className={`rounded-lg border p-4 ${answerChangedSinceGrade ? 'border-neutral-700 bg-neutral-900/50' : canAdvance ? 'border-emerald-800 bg-emerald-950/30' : 'border-amber-800 bg-amber-950/25'}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              className={`inline-flex items-center gap-2 font-semibold ${answerChangedSinceGrade ? 'text-neutral-200' : canAdvance ? 'text-emerald-200' : 'text-amber-100'}`}
            >
              {canAdvance ? (
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Circle className="h-5 w-5" aria-hidden="true" />
              )}
              {answerChangedSinceGrade
                ? 'Answer changed—grade it again'
                : canAdvance
                  ? 'Section mastered'
                  : 'Almost there—revise and try again'}
            </div>
            <div className="text-sm text-neutral-300">
              <span className="text-lg font-bold text-white">{score}</span>/10
            </div>
          </div>
          {!canAdvance && !answerChangedSinceGrade && (
            <p className="mt-2 text-sm text-neutral-400">
              Review the feedback, strengthen your answer, then resubmit. You
              need 8/10 to continue.
            </p>
          )}
        </div>
      )}
      {typeof score === 'number' && feedback && (
        <div className="chat-md mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
          <div className="mb-2 text-xs font-semibold tracking-[0.12em] text-neutral-500 uppercase">
            Feedback
          </div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {feedback}
          </ReactMarkdown>
        </div>
      )}
      {typeof score === 'number' && modelAnswer && (
        <details className="group mt-2 rounded-lg border border-neutral-800 bg-neutral-900/30 p-4 text-sm text-neutral-400">
          <summary className="cursor-pointer font-medium text-neutral-300 marker:text-neutral-500">
            Compare with a strong answer
          </summary>
          <div className="chat-md mt-3 border-t border-neutral-800 pt-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {modelAnswer}
            </ReactMarkdown>
          </div>
        </details>
      )}
      {canAdvance && (
        <div className="space-y-3 pt-2">
          {advanceError && (
            <div
              className="rounded-md border border-red-900/70 bg-red-950/20 p-3 text-sm text-red-200"
              role="alert"
            >
              <div className="font-medium">Progress was not saved</div>
              <p className="mt-1 text-neutral-300">{advanceError}</p>
            </div>
          )}
          <button
            onClick={() => void continueAfterMastery()}
            disabled={advancing}
            aria-busy={advancing || undefined}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-70"
          >
            {advancing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving progress…
              </>
            ) : (
              <>
                {advanceError
                  ? 'Try saving again'
                  : isLast
                    ? 'Complete lesson'
                    : 'Continue to next section'}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
