'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

type GeneratingOverlayProps = {
  visible: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
  hasError?: boolean;
  errorMessage?: string;
  ariaLabel?: string;
  // Optional override messages; otherwise defaults are used
  messages?: string[];
  // Milliseconds between message rotations
  messageIntervalMs?: number;
  // If true, hide the cancel button
  hideCancel?: boolean;
};

export default function GeneratingOverlay({
  visible,
  onCancel,
  onRetry,
  onBack,
  hasError,
  errorMessage,
  ariaLabel = 'Generating lesson…',
  messages,
  messageIntervalMs = 1800,
  hideCancel = false,
}: GeneratingOverlayProps) {
  const defaultMessages = useMemo(
    () =>
      [
        'Analyzing content…',
        'Finding key concepts…',
        'Drafting sections…',
        'Grounding in your document…',
        'Refining explanations…',
        'Finalizing questions…',
      ],
    []
  );
  const msgs = messages && messages.length > 0 ? messages : defaultMessages;

  const [index, setIndex] = useState(0);
  const [longWait, setLongWait] = useState(false);
  const timerRef = useRef<number | null>(null);
  const longWaitRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible || hasError) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      if (longWaitRef.current) window.clearTimeout(longWaitRef.current);
      longWaitRef.current = null;
      setLongWait(false);
      setIndex(0);
      return;
    }
    timerRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % msgs.length);
    }, Math.max(800, messageIntervalMs));
    // 10s reassurance message and tip
    longWaitRef.current = window.setTimeout(() => setLongWait(true), 10000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (longWaitRef.current) window.clearTimeout(longWaitRef.current);
    };
  }, [visible, hasError, msgs.length, messageIntervalMs]);

  // Prevent pointer events and narration when hidden; keep in DOM for fade-out CSS
  const containerClass = `fixed inset-0 z-50 flex items-center justify-center ${
    visible ? 'pointer-events-auto' : 'pointer-events-none'
  }`;
  const panelClass = `rounded-xl border border-neutral-800 bg-neutral-950/70 shadow-2xl backdrop-blur-sm w-[92%] max-w-[520px] p-5 md:p-6 text-neutral-200 transition-opacity duration-200 ${
    visible ? 'opacity-100' : 'opacity-0'
  }`;

  const backdropClass = `absolute inset-0 ${visible ? 'opacity-100' : 'opacity-0'} bg-black/60 transition-opacity duration-200`;

  return (
    <div className={containerClass} aria-hidden={!visible}>
      <div className={backdropClass} />
      <div
        className={panelClass}
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
      >
        {!hasError ? (
          <div className="flex flex-col items-center text-center">
            {/* Animation: CSS orbit. Reduced motion switches to subtle progress bar. */}
            <div className="relative h-24 w-24" aria-hidden="true">
              <div className="motion-safe:block motion-reduce:hidden">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[rgb(var(--accent))] to-cyan-400/70 opacity-20" />
                <div className="absolute inset-0 rounded-full border border-[rgba(255,255,255,0.12)]" />
                <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(var(--accent))] shadow-[0_0_24px_rgba(0,0,0,0.5)]" />
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 animate-[orbit_2.2s_linear_infinite]" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/90 animate-[orbit_3.2s_linear_infinite]" />
              </div>
              {/* Reduced motion: progress bar */}
              <div className="motion-safe:hidden motion-reduce:block">
                <div className="mt-9 h-2 w-24 overflow-hidden rounded-full bg-neutral-800">
                  <div className="h-2 w-1/3 animate-[bar_1.2s_ease_infinite] rounded-full bg-[rgb(var(--accent))]" />
                </div>
              </div>
            </div>

            <div className="mt-5 text-base font-medium">
              {msgs[index]}
            </div>
            {longWait && (
              <div className="mt-2 text-xs text-neutral-400">
                This can take up to a minute. Tip: you can keep browsing other sections.
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {!hideCancel && (
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={onCancel}
                >
                  Cancel
                </button>
              )}
              {onBack && (
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={onBack}
                >
                  Go back
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 text-red-300">
              <AlertCircle className="h-5 w-5" />
              <span className="text-base font-semibold">Generation failed</span>
            </div>
            <p className="mt-2 text-sm text-neutral-300">
              {errorMessage || 'Something went wrong while generating your lesson.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {onRetry && (
                <button
                  className="rounded-md bg-[rgb(var(--accent))] px-3 py-1.5 text-sm font-semibold text-black hover:brightness-110"
                  onClick={onRetry}
                >
                  Retry
                </button>
              )}
              {onBack && (
                <button
                  className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
                  onClick={onBack}
                >
                  Back
                </button>
              )}
            </div>
          </div>
        )}

        {/* CSS keyframes for orbit + progress */}
        <style jsx>{`
          @keyframes orbit {
            0% { transform: translate(-50%, -50%) rotate(0deg) translateX(40px) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg) translateX(40px) rotate(-360deg); }
          }
          @keyframes bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>

      {/* noscript fallback: static informative state */}
      <noscript>
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div className="rounded-md border border-neutral-800 bg-neutral-950 px-5 py-4 text-neutral-200">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4" />
              <span>Generating lesson… This can take up to a minute.</span>
            </div>
          </div>
        </div>
      </noscript>
    </div>
  );
}


