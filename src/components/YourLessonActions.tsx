'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ClipboardX,
  EllipsisVertical,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import useFocusTrap from '@/hooks/useFocusTrap';
import { useShareLesson } from '@/lib/client/use-share-lesson';

export default function YourLessonActions({
  lectureId,
  initialDiscoverable = false,
  label = 'Lesson actions',
}: {
  lectureId: string;
  initialDiscoverable?: boolean;
  label?: string;
}) {
  const { state, setState, createOrUpdate, revoke } = useShareLesson(lectureId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setState((s) => ({ ...s, discoverable: initialDiscoverable }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!open) return;
      if (
        menuRef.current &&
        !menuRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        setOpen(false);
        try {
          triggerRef.current?.focus();
        } catch {}
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        try {
          triggerRef.current?.focus();
        } catch {}
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll('[role="menuitem"]');
        if (!items || items.length === 0) return;
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        const active = document.activeElement;
        let idx = -1;
        items.forEach((el, i) => {
          if (el === active) idx = i;
        });
        const next = items[
          (idx + dir + items.length) % items.length
        ] as HTMLElement;
        try {
          next.focus();
        } catch {}
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Pre-create a share link when the menu opens so the first Share click can copy immediately
  useEffect(() => {
    (async () => {
      try {
        if (open && !state.created && !state.busy) {
          await createOrUpdate();
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(settingsRef, settingsOpen, { focusOnActivate: true });

  const primaryShare = async () => {
    // If link already exists, copy immediately within the user gesture
    if (state.shareUrl) {
      try {
        await navigator.clipboard.writeText(state.shareUrl);
        setToast({ kind: 'success', url: state.shareUrl });
      } catch {
        setToast({ kind: 'ready', url: state.shareUrl });
      }
      return;
    }

    // Otherwise, create it, then attempt to copy (may be blocked since not in the original gesture)
    const res = await createOrUpdate();
    if (!res.ok) return;
    try {
      if (res.url) await navigator.clipboard.writeText(res.url);
      setToast({ kind: 'success', url: res.url || null });
    } catch {
      setToast({ kind: 'ready', url: res.url || null });
    }
    setOpen(false);
  };

  // Share prompt/toast state
  const [toast, setToast] = useState<{
    kind: 'success' | 'ready' | null;
    url: string | null;
  }>({ kind: null, url: null });

  // Manage delayed progress prompt and slow-path message
  // Removed progress toast; only show result toasts

  // Auto-hide success/ready toast after a short delay
  useEffect(() => {
    if (!toast.kind) return;
    const t = window.setTimeout(
      () => setToast({ kind: null, url: null }),
      2600
    );
    return () => {
      window.clearTimeout(t);
    };
  }, [toast.kind]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`menu-${lectureId}`}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 p-1.5 text-neutral-200 hover:bg-neutral-700"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={`menu-${lectureId}`}
          role="menu"
          aria-label={label}
          className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-neutral-700 bg-neutral-900 p-1 text-sm text-neutral-200 shadow-lg"
        >
          <button
            role="menuitem"
            onClick={() => void primaryShare()}
            disabled={state.busy || !state.created}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {!state.created || state.busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
            {!state.created || state.busy
              ? 'Preparing share link…'
              : 'Share link'}
          </button>
          {/* Discoverable removed; links are public by default */}
          <hr className="my-1 border-neutral-800" />
          <button
            role="menuitem"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-800"
          >
            Settings…
          </button>
        </div>
      )}

      {settingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div
            ref={settingsRef}
            className="w-full max-w-sm rounded-md border border-neutral-700 bg-neutral-900 p-4 text-neutral-200 shadow-xl"
          >
            <h3 className="text-lg font-semibold">Share settings</h3>
            <p className="mt-1 mb-3 text-sm text-neutral-400">
              Advanced controls for this lesson’s share link.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => void createOrUpdate({ regenerate: true })}
                disabled={state.busy || !state.created}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 hover:bg-neutral-700 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" /> Regenerate link
              </button>
              <button
                onClick={async () => {
                  if (typeof window !== 'undefined') {
                    const ok = window.confirm(
                      'Revoke share link? This breaks any existing link.'
                    );
                    if (!ok) return;
                  }
                  await revoke();
                  setSettingsOpen(false);
                }}
                disabled={state.busy || !state.created}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-red-700/50 bg-red-900/30 px-3 py-2 text-red-100 hover:bg-red-800/40 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" /> Revoke link
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Non-blocking share prompt / mini-toast */}
      {toast.kind && (
        <div className="fixed right-4 bottom-4 z-40 max-w-sm">
          {toast.kind === 'success' && (
            <div className="rounded-md border border-green-700/40 bg-green-900/30 p-3 text-sm text-green-100 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">Link ready</div>
                  <div className="mt-0.5 text-green-200/90">
                    Anyone with the link can view this lesson.
                  </div>
                </div>
              </div>
            </div>
          )}

          {toast.kind === 'ready' && (
            <div className="rounded-md border border-yellow-700/40 bg-yellow-900/30 p-3 text-sm text-yellow-100 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2">
                <ClipboardX className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">Link ready</div>
                  <div className="mt-0.5 text-yellow-200/90">
                    Clipboard access was blocked. Tap to copy.
                  </div>
                  {state.shareUrl && (
                    <div
                      className="mt-1 truncate text-xs text-yellow-200/70"
                      title={state.shareUrl}
                    >
                      {state.shareUrl}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                {state.shareUrl && (
                  <>
                    <a
                      href={state.shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
                    >
                      View link
                    </a>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            state.shareUrl || ''
                          );
                          setToast({
                            kind: 'success',
                            url: state.shareUrl || null,
                          });
                        } catch {}
                      }}
                      className="rounded-md bg-[rgb(var(--accent))] px-2 py-1 text-xs font-medium text-black hover:brightness-110"
                    >
                      Copy link
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
