'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { DeleteGlyph } from '@/components/icons/LearningGlyphs';

export default function DeleteLectureButton({
  lectureId,
  onDeleted,
  onDeleting,
  onDeleteError,
  onDeleteSuccess,
  redirectTo,
  label = 'Delete lesson',
  confirmMessage = 'Delete this lecture? This cannot be undone.',
}: {
  lectureId: string;
  onDeleted?: () => void; // called on success (legacy)
  onDeleting?: () => void; // called immediately after user confirms
  onDeleteError?: (message: string) => void; // called on failure
  onDeleteSuccess?: () => void; // called on success
  redirectTo?: string; // optional path to navigate to on success
  label?: string;
  confirmMessage?: string; // custom confirm text
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // While busy, block tab close and prompt on internal link clicks
  useEffect(() => {
    if (!busy) return;
    const leaveMsg = 'Deletion in progress. Are you sure you want to leave?';
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = leaveMsg;
      return leaveMsg;
    };
    const onDocClick = (e: Event) => {
      try {
        let el = e.target as Element | null;
        while (el && el !== document.body) {
          if (el instanceof HTMLAnchorElement && el.href) {
            const ok = window.confirm(leaveMsg);
            if (!ok) {
              e.preventDefault();
              e.stopPropagation();
              // Some Event types do not implement stopImmediatePropagation
              const maybeStop = (e as any).stopImmediatePropagation;
              if (typeof maybeStop === 'function') maybeStop.call(e);
            }
            return;
          }
          el = el.parentElement;
        }
      } catch {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocClick, true);
    };
  }, [busy]);

  const onDelete = async () => {
    if (busy || isPending) return;
    const ok =
      typeof window !== 'undefined' ? window.confirm(confirmMessage) : false;
    if (!ok) return;

    try {
      setBusy(true);
      try {
        // telemetry: start
        void fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'lecture.delete.start', lectureId }),
        });
      } catch {}
      onDeleting?.();
      const res = await fetch(`/api/lectures/${lectureId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        if (res.status === 404) {
          // Consider already-deleted as success for resilience
          onDeleted?.();
          onDeleteSuccess?.();
          try {
            void fetch('/api/telemetry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'lecture.delete.success.404',
                lectureId,
              }),
            });
          } catch {}
          if (redirectTo) {
            startTransition(() => router.push(redirectTo));
          } else if (!onDeleted) {
            startTransition(() => router.refresh());
          }
          return;
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error || "Couldn't delete the lecture. Try again."
        );
      }
      // success
      onDeleted?.();
      onDeleteSuccess?.();
      try {
        void fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'lecture.delete.success', lectureId }),
        });
      } catch {}
      if (redirectTo) {
        startTransition(() => router.push(redirectTo));
      } else if (!onDeleted) {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      const message =
        (e as Error)?.message || "Couldn't delete the lecture. Try again.";
      onDeleteError?.(message);
      try {
        void fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'lecture.delete.failure',
            lectureId,
            error: message,
          }),
        });
      } catch {}
      if (!onDeleteError) {
        // Fallback UX
        alert(message);
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || isPending;

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={disabled}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-red-700/50 bg-red-950/35 text-red-200 transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-0.5 hover:border-red-600/70 hover:bg-red-900/45 hover:text-red-100 active:translate-y-0 disabled:cursor-wait disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
      aria-disabled={disabled}
      title={label}
      aria-label={label}
      aria-busy={disabled}
    >
      {disabled ? (
        <Loader2 className="block h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <DeleteGlyph className="block h-[18px] w-[18px]" />
      )}
      <span className="sr-only" aria-live="polite">
        {disabled ? 'Deleting lecture…' : ''}
      </span>
    </button>
  );
}
