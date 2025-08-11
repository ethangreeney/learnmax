'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import { useParams } from 'next/navigation';

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
  useEffect(() => {
    // Fire-and-forget: award one-time lecture completion ELO
    const id = String(params?.lectureId || '').trim();
    if (!id) return;
    (async () => {
      try {
        await fetch('/api/lectures/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lectureId: id }),
        });
      } catch {}
    })();
  }, [params?.lectureId]);
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
    <main
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
        <div className="relative rounded-2xl border border-green-400/30 bg-neutral-900/70 p-10 text-center backdrop-blur-sm">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-green-500/20 ring-1 ring-green-500/40">
            <span className="text-3xl leading-none text-green-400">✓</span>
          </div>
          <h1 className="text-2xl font-semibold text-green-400">
            Lecture Complete
          </h1>
          <p className="mt-3 text-neutral-300">
            Nicely done. You mastered every subtopic in this lecture.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/learn"
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
            >
              Learn something new
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
            >
              Go to dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
