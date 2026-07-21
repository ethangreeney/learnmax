'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import { useParams } from 'next/navigation';

type CompletionState = 'verifying' | 'complete' | 'incomplete' | 'error';

/** Measure real header height so we center below it */
function useHeaderHeightVar() {
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const set = () =>
      document.body.style.setProperty(
        '--header-h',
        `${header.getBoundingClientRect().height}px`
      );
    requestAnimationFrame(set);
    window.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
      document.body.style.removeProperty('--header-h');
    };
  }, []);
}

export default function CompletePage() {
  useBodyScrollLock(true);
  const params = useParams() as { lectureId?: string };
  const lectureId = String(params?.lectureId || '').trim();
  const [completionState, setCompletionState] =
    useState<CompletionState>('verifying');
  const [statusMessage, setStatusMessage] = useState(
    'Confirming your lesson progress…'
  );

  useEffect(() => {
    if (!lectureId) {
      setCompletionState('error');
      setStatusMessage('This lesson could not be identified.');
      return;
    }

    setCompletionState('verifying');
    setStatusMessage('Confirming your lesson progress…');
    const controller = new AbortController();
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/lectures/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lectureId }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          mastered?: number;
          total?: number;
        };
        if (!active) return;

        if (res.ok && data.ok) {
          setCompletionState('complete');
          setStatusMessage(
            'Nicely done. You mastered every section in this lesson.'
          );
          try {
            window.dispatchEvent(new Event('elo:maybeRefresh'));
          } catch {}
          return;
        }

        if (res.status === 409) {
          setCompletionState('incomplete');
          const progress =
            typeof data.mastered === 'number' &&
            typeof data.total === 'number' &&
            data.total > 0
              ? ` You have mastered ${data.mastered} of ${data.total} sections.`
              : '';
          setStatusMessage(
            `${data.error || 'Finish the remaining sections before completing this lesson.'}${progress}`
          );
          return;
        }

        setCompletionState('error');
        setStatusMessage(
          data.error ||
            'Your completion could not be verified. Please try again.'
        );
      } catch (error) {
        if (
          !active ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return;
        setCompletionState('error');
        setStatusMessage(
          'Your completion could not be verified. Check your connection and try again.'
        );
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [lectureId]);
  useHeaderHeightVar();

  useEffect(() => {
    const prev = document.body.getAttribute('data-page');
    document.body.setAttribute('data-page', 'complete');
    return () => {
      if (prev) document.body.setAttribute('data-page', prev);
      else document.body.removeAttribute('data-page');
    };
  }, []);

  return (
    <section
      aria-labelledby="completion-title"
      className="flex items-center justify-center px-4"
      style={{ minHeight: 'calc(100svh - var(--header-h, 64px))' }}
    >
      <div
        className="relative w-full max-w-4xl"
        style={{ transform: 'translateY(var(--complete-y, -48px))' }}
      >
        {/* Even softer halo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-16 -inset-y-8 rounded-[32px] blur-md"
          style={{
            /* green-500 rgb(34,197,94) */
            background:
              'radial-gradient(120% 85% at 50% 50%, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.05) 42%, rgba(34,197,94,0.025) 62%, transparent 76%)',
          }}
        />
        {/* Balanced outer softness */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[24px]"
          style={{
            boxShadow:
              '0 0 36px rgba(34,197,94,0.10), 0 0 12px rgba(34,197,94,0.06)',
          }}
        />
        {/* Card */}
        <div
          className={`relative rounded-2xl border bg-neutral-900/70 p-10 text-center backdrop-blur-sm ${completionState === 'complete' ? 'border-green-400/30' : 'border-neutral-700'}`}
          aria-live="polite"
        >
          <div
            className={`mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full ring-1 ${completionState === 'complete' ? 'bg-green-500/20 ring-green-500/40' : 'bg-neutral-800 ring-neutral-700'}`}
          >
            <span
              className={`text-3xl leading-none ${completionState === 'complete' ? 'text-green-400' : 'text-neutral-300'} ${completionState === 'verifying' ? 'motion-safe:animate-pulse' : ''}`}
              aria-hidden="true"
            >
              {completionState === 'verifying'
                ? '…'
                : completionState === 'complete'
                  ? '✓'
                  : '!'}
            </span>
          </div>
          <h1
            id="completion-title"
            className={`text-2xl font-semibold ${completionState === 'complete' ? 'text-green-400' : 'text-white'}`}
          >
            {completionState === 'verifying'
              ? 'Verifying progress'
              : completionState === 'complete'
                ? 'Lesson complete'
                : completionState === 'incomplete'
                  ? 'Lesson still in progress'
                  : 'Could not verify completion'}
          </h1>
          <p className="mt-3 text-neutral-300">{statusMessage}</p>
          {completionState === 'complete' && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/learn"
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
              >
                Learn something new
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                Go to dashboard
              </Link>
            </div>
          )}
          {(completionState === 'incomplete' ||
            completionState === 'error') && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href={`/learn/${encodeURIComponent(lectureId)}`}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
              >
                Return to lesson
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                Go to dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
