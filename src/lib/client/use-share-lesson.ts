'use client';

import { useCallback, useRef, useState } from 'react';

export type ShareState = {
  shareUrl: string | null;
  token: string | null;
  discoverable: boolean;
  created: boolean;
  busy: boolean;
  error: string | null;
};

export function useShareLesson(lectureId: string) {
  const [state, setState] = useState<ShareState>({
    shareUrl: null,
    token: null,
    discoverable: false,
    created: false,
    busy: false,
    error: null,
  });
  const inFlightRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  const setBusy = (busy: boolean) => setState((s) => ({ ...s, busy }));
  const setErr = (err: string | null) => setState((s) => ({ ...s, error: err }));

  const createOrUpdate = useCallback(async ({ regenerate }: { regenerate?: boolean } = {}) => {
    if (inFlightRef.current) return { ok: false } as const;
    inFlightRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      // Abort any previously queued controller just in case
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch {}
      }
      abortRef.current = new AbortController();
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoverable: state.discoverable, regenerate: Boolean(regenerate) }),
        signal: abortRef.current.signal,
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(data?.error || 'Failed to update share link');
      const url = String(data?.shareUrl || '');
      const token = String(data?.token || '');
      const discoverable = Boolean(data?.discoverable);
      setState((s) => ({
        ...s,
        shareUrl: url || null,
        token: token || null,
        discoverable,
        created: Boolean(url && token),
      }));
      return { ok: true, url } as const;
    } catch (e: any) {
      // If aborted, swallow specific message for cleaner UX
      const message = e?.name === 'AbortError' ? 'Canceled' : (e?.message || 'Failed');
      setErr(message);
      return { ok: false } as const;
    } finally {
      inFlightRef.current = false;
      setBusy(false);
      abortRef.current = null;
    }
  }, [lectureId, state.discoverable]);

  const revoke = useCallback(async () => {
    if (inFlightRef.current) return { ok: false } as const;
    inFlightRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/share`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.error || 'Failed to revoke share');
      }
      setState({ shareUrl: null, token: null, discoverable: false, created: false, busy: false, error: null });
      return { ok: true } as const;
    } catch (e: any) {
      setErr(e?.message || 'Failed');
      return { ok: false } as const;
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [lectureId]);

  // Discoverable toggle removed — share links are public by default

  const copy = useCallback(async () => {
    const url = state.shareUrl;
    if (!url) return { ok: false } as const;
    try {
      if (typeof window === 'undefined') return { ok: false } as const;
      await window.navigator.clipboard.writeText(url);
      return { ok: true } as const;
    } catch {
      return { ok: false } as const;
    }
  }, [state.shareUrl]);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
  }, []);

  return {
    state,
    setState,
    createOrUpdate,
    revoke,
    copy,
    cancel,
  } as const;
}


