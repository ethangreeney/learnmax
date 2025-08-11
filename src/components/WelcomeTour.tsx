'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  selector?: string;
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
};

type StoredState = {
  status: 'never' | 'in_progress' | 'skipped' | 'completed';
  index: number;
  updatedAt: number;
};

type WelcomeTourProps = {
  steps: TourStep[];
  storageKey: string;
  autoShow?: boolean;
  context: { page: string; lessonId?: string };
  restartSignal?: number;
};

function readStoredState(key: string): StoredState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { status: 'never', index: 0, updatedAt: Date.now() };
    const parsed = JSON.parse(raw);
    const status = parsed?.status as StoredState['status'];
    const index = Number(parsed?.index ?? 0) || 0;
    if (!status || !['never', 'in_progress', 'skipped', 'completed'].includes(status)) {
      return { status: 'never', index: 0, updatedAt: Date.now() };
    }
    return { status, index, updatedAt: Number(parsed?.updatedAt) || Date.now() };
  } catch {
    return { status: 'never', index: 0, updatedAt: Date.now() };
  }
}

function writeStoredState(key: string, next: StoredState) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...next, updatedAt: Date.now() }));
  } catch {}
}

async function postTelemetry(event: string, props: Record<string, any>) {
  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...props }),
    });
  } catch {}
}

export default function WelcomeTour({ steps, storageKey, autoShow = true, context, restartSignal = 0 }: WelcomeTourProps) {
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return true;
    }
  }, []);

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [panelDims, setPanelDims] = useState<{ w: number; h: number } | null>(null);
  const [currentStepId, setCurrentStepId] = useState<string>('');
  const [telemetryCtx, setTelemetryCtx] = useState<{ auth: 'anon' | 'user'; device: 'mobile' | 'tablet' | 'desktop'; locale: string }>({ auth: 'anon', device: 'desktop', locale: 'en-US' });

  const panelRef = useRef<HTMLDivElement | null>(null);
  // Focus the panel on open for SR announcement; do not trap focus to keep UI non-blocking
  useEffect(() => {
    if (!open) return;
    try {
      panelRef.current?.focus({ preventScroll: true } as any);
    } catch {}
  }, [open]);

  const total = steps.length;
  const current = steps[index] || steps[0];

  const saveProgress = useCallback(
    (status: StoredState['status'], idx = index) => {
      writeStoredState(storageKey, { status, index: idx, updatedAt: Date.now() });
    },
    [index, storageKey]
  );

  // Gather telemetry context once, non-blocking
  useEffect(() => {
    try {
      const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
      const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const device: 'mobile' | 'tablet' | 'desktop' = width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
      setTelemetryCtx((t) => ({ ...t, device, locale }));
    } catch {}
    // Auth state
    (async () => {
      try {
        const res = await fetch('/api/whoami', { method: 'GET' });
        const data = await res.json().catch(() => ({}));
        const has = Boolean(data?.hasSession);
        setTelemetryCtx((t) => ({ ...t, auth: has ? 'user' : 'anon' }));
      } catch {}
    })();
  }, []);

  const previousTargetRef = useRef<HTMLElement | null>(null);
  const previousAriaDescRef = useRef<string | null>(null);
  const computeTarget = useCallback((opts?: { scrollIntoView?: boolean }) => {
    if (!open) {
      // Cleanup any previous target a11y attributes
      try {
        if (previousTargetRef.current) {
          if (previousAriaDescRef.current === null) {
            previousTargetRef.current.removeAttribute('aria-describedby');
          } else {
            previousTargetRef.current.setAttribute('aria-describedby', previousAriaDescRef.current);
          }
          previousTargetRef.current.removeAttribute('data-welcome-tour-target');
        }
      } catch {}
      previousTargetRef.current = null;
      previousAriaDescRef.current = null;
      setTargetRect(null);
      return;
    }
    const step = steps[index];
    setCurrentStepId(step?.id || '');
    if (!step?.selector) {
      // cleanup previous target markers
      try {
        if (previousTargetRef.current) {
          if (previousAriaDescRef.current === null) {
            previousTargetRef.current.removeAttribute('aria-describedby');
          } else {
            previousTargetRef.current.setAttribute('aria-describedby', previousAriaDescRef.current);
          }
          previousTargetRef.current.removeAttribute('data-welcome-tour-target');
        }
      } catch {}
      previousTargetRef.current = null;
      previousAriaDescRef.current = null;
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (!el) {
      try {
        if (previousTargetRef.current) {
          if (previousAriaDescRef.current === null) {
            previousTargetRef.current.removeAttribute('aria-describedby');
          } else {
            previousTargetRef.current.setAttribute('aria-describedby', previousAriaDescRef.current);
          }
          previousTargetRef.current.removeAttribute('data-welcome-tour-target');
        }
      } catch {}
      previousTargetRef.current = null;
      previousAriaDescRef.current = null;
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 8;
    setTargetRect({ x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 });
    try {
      // Mark as target for a11y relation; avoid clobbering existing id
      el.setAttribute('data-welcome-tour-target', 'true');
      // capture prior aria-describedby
      previousAriaDescRef.current = el.getAttribute('aria-describedby');
      const bodyId = 'welcome-tour-body';
      const prevDesc = previousAriaDescRef.current;
      const newDesc = prevDesc ? `${prevDesc} ${bodyId}` : bodyId;
      el.setAttribute('aria-describedby', newDesc);
      previousTargetRef.current = el;
    } catch {}
    try {
      if (opts?.scrollIntoView) {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    } catch {}
  }, [index, open, steps, prefersReducedMotion]);

  useLayoutEffect(() => {
    computeTarget({ scrollIntoView: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => computeTarget({ scrollIntoView: false });
    const onResize = () => computeTarget({ scrollIntoView: false });
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, computeTarget]);

  // Measure panel size whenever content or step changes to clamp into viewport
  useLayoutEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPanelDims({ w: r.width, h: r.height });
  }, [open, index, currentStepId]);

  useEffect(() => {
    if (!autoShow) return;
    try {
      const s = readStoredState(storageKey);
      if (s.status === 'never' || s.status === 'in_progress') {
        setIndex(Math.max(0, Math.min(steps.length - 1, s.index || 0)));
        setOpen(true);
        postTelemetry(s.status === 'never' ? 'tour_start' : 'tour_resume', {
          page: context.page,
          lessonId: context.lessonId || 'example',
          stepIndex: Math.max(0, Math.min(steps.length - 1, s.index || 0)),
          totalSteps: steps.length,
          auth: telemetryCtx.auth,
          device: telemetryCtx.device,
          locale: telemetryCtx.locale,
        });
        saveProgress('in_progress', s.index || 0);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoShow]);

  // Restart when restartSignal changes
  const prevRestartRef = useRef<number>(restartSignal);
  useEffect(() => {
    if (restartSignal !== prevRestartRef.current) {
      prevRestartRef.current = restartSignal;
      setIndex(0);
      setOpen(true);
      saveProgress('in_progress', 0);
      postTelemetry('tour_restart', { page: context.page, lessonId: context.lessonId || 'example', auth: telemetryCtx.auth, device: telemetryCtx.device, locale: telemetryCtx.locale });
      postTelemetry('tour_start', { page: context.page, lessonId: context.lessonId || 'example', stepIndex: 0, totalSteps: steps.length, auth: telemetryCtx.auth, device: telemetryCtx.device, locale: telemetryCtx.locale });
    }
  }, [restartSignal, context.page, context.lessonId, steps.length, saveProgress, telemetryCtx.auth, telemetryCtx.device, telemetryCtx.locale]);

  // ESC closes without marking skipped; progress persists for resume
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleBack();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  const stepStartRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!open) return;
    stepStartRef.current = Date.now();
  }, [index, open]);

  const handleNext = useCallback(() => {
    const dwellMs = Date.now() - (stepStartRef.current || Date.now());
    const nextIdx = Math.min(total - 1, index + 1);
    postTelemetry('tour_next', {
      page: context.page,
      lessonId: context.lessonId || 'example',
      from: index,
      to: nextIdx,
      stepId: current?.id,
      dwellMs,
      auth: telemetryCtx.auth,
      device: telemetryCtx.device,
      locale: telemetryCtx.locale,
    });
    if (nextIdx === index) return;
    setIndex(nextIdx);
    saveProgress('in_progress', nextIdx);
    if (nextIdx === total - 1) {
      // Will complete on Finish button, not here
    }
  }, [index, total, current?.id, context.page, context.lessonId, saveProgress]);

  const handleBack = useCallback(() => {
    const dwellMs = Date.now() - (stepStartRef.current || Date.now());
    const prevIdx = Math.max(0, index - 1);
    postTelemetry('tour_back', {
      page: context.page,
      lessonId: context.lessonId || 'example',
      from: index,
      to: prevIdx,
      stepId: current?.id,
      dwellMs,
      auth: telemetryCtx.auth,
      device: telemetryCtx.device,
      locale: telemetryCtx.locale,
    });
    if (prevIdx === index) return;
    setIndex(prevIdx);
    saveProgress('in_progress', prevIdx);
  }, [index, current?.id, context.page, context.lessonId, saveProgress]);

  const handleSkip = useCallback(() => {
    const dwellMs = Date.now() - (stepStartRef.current || Date.now());
    postTelemetry('tour_skip', {
      page: context.page,
      lessonId: context.lessonId || 'example',
      stepIndex: index,
      dwellMs,
      auth: telemetryCtx.auth,
      device: telemetryCtx.device,
      locale: telemetryCtx.locale,
    });
    saveProgress('skipped', index);
    setOpen(false);
  }, [index, context.page, context.lessonId, saveProgress]);

  const handleFinish = useCallback(() => {
    const dwellMs = Date.now() - (stepStartRef.current || Date.now());
    postTelemetry('tour_complete', {
      page: context.page,
      lessonId: context.lessonId || 'example',
      dwellMs,
      auth: telemetryCtx.auth,
      device: telemetryCtx.device,
      locale: telemetryCtx.locale,
    });
    saveProgress('completed', index);
    setOpen(false);
  }, [index, context.page, context.lessonId, saveProgress]);

  // Announce step changes politely
  const liveRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    try {
      liveRef.current!.textContent = `Step ${index + 1} of ${total}`;
    } catch {}
    postTelemetry('tour_step_view', {
      page: context.page,
      lessonId: context.lessonId || 'example',
      stepIndex: index,
      stepId: currentStepId,
      totalSteps: total,
      auth: telemetryCtx.auth,
      device: telemetryCtx.device,
      locale: telemetryCtx.locale,
    });
  }, [index, total, open, context.page, context.lessonId, currentStepId, telemetryCtx.auth, telemetryCtx.device, telemetryCtx.locale]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open || !mounted) return null;

  // Compute panel position near target rect
  let panelStyle: React.CSSProperties = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (targetRect) {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const ph = panelDims?.h ?? 220;
    const preferred = current?.placement || 'auto';
    const canPlaceBottom = targetRect.y + targetRect.h + ph + 24 < vh;
    const canPlaceTop = targetRect.y - ph - 24 > 0;
    let place: 'top' | 'bottom' = 'bottom';
    if (preferred === 'top') place = canPlaceTop ? 'top' : 'bottom';
    else if (preferred === 'bottom') place = canPlaceBottom ? 'bottom' : 'top';
    else place = canPlaceBottom ? 'bottom' : 'top';
    const pw = panelDims?.w ?? 360;
    const cx = targetRect.x + targetRect.w / 2;
    const left = Math.min(vw - 16 - pw / 2, Math.max(16 + pw / 2, cx));
    const unclampedTop = place === 'bottom' ? targetRect.y + targetRect.h + 12 : targetRect.y - ph - 12;
    const top = Math.min(Math.max(24, unclampedTop), Math.max(24, vh - ph - 24));
    panelStyle = {
      position: 'fixed',
      left,
      top,
      transform: 'translateX(-50%)',
      maxWidth: Math.min(420, vw - 32),
    } as React.CSSProperties;
  }

  const ringStyle: React.CSSProperties | undefined = targetRect
    ? {
        position: 'fixed',
        left: targetRect.x,
        top: targetRect.y,
        width: targetRect.w,
        height: targetRect.h,
        borderRadius: 8,
        boxShadow: '0 0 0 2px rgba(255,255,255,0.7), 0 0 0 12px rgba(255,255,255,0.15)',
        pointerEvents: 'none',
        transition: prefersReducedMotion ? 'none' : 'all 160ms ease',
      }
    : undefined;

  const overlay = (
    <div className="fixed inset-0 z-[9999]" aria-live="polite" aria-relevant="all">
      {/* Dim overlay - non-blocking */}
      <div
        className="fixed inset-0 bg-black/40"
        style={{ pointerEvents: 'none', transition: prefersReducedMotion ? 'none' : 'opacity 160ms ease' }}
      />

      {/* Highlight ring around target */}
      {ringStyle && <div aria-hidden="true" style={ringStyle} />}

      {/* Tour panel */}
      <div
        ref={(node) => {
          panelRef.current = node;
        }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="welcome-tour-title"
        aria-describedby="welcome-tour-body"
        tabIndex={-1}
        className="rounded-lg border border-neutral-700 bg-neutral-900/95 p-4 shadow-2xl backdrop-blur-sm focus:outline-none"
        style={panelStyle}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h2 id="welcome-tour-title" className="text-base font-semibold text-white">
              {current.title}
            </h2>
            <p id="welcome-tour-body" className="text-sm text-neutral-300">
              {current.body}
            </p>
            <p className="sr-only" aria-live="polite" ref={liveRef} />
            <div className="mt-2 text-xs text-neutral-400">Step {index + 1} of {total}</div>
          </div>
            <button
            onClick={() => setOpen(false)}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--accent))]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleBack}
              disabled={index === 0}
              className="rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--accent))] disabled:opacity-50"
            >
              Back
            </button>
            {index < total - 1 ? (
              <button
                onClick={handleNext}
                className="rounded-md bg-[rgb(var(--accent))] px-4 py-1.5 text-sm font-semibold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-300"
              >
                Finish
              </button>
            )}
          </div>

          <button
            onClick={handleSkip}
            className="text-sm text-neutral-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--accent))]"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}


