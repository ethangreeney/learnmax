'use client';

import { useEffect, useState } from 'react';
import { Copy, Link as LinkIcon, RefreshCw, EyeOff, Eye, Loader2, Check, ClipboardX } from 'lucide-react';

export default function ShareControls({ lectureId }: { lectureId: string }) {
  const [link, setLink] = useState<string>('');
  const [discoverable, setDiscoverable] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [created, setCreated] = useState<boolean>(false);
  const [toast, setToast] = useState<'success' | 'ready' | null>(null);

  useEffect(() => {
    // no load state; controls are optimistic
  }, [lectureId]);

  const createOrUpdate = async (opts?: { regenerate?: boolean }) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoverable, regenerate: Boolean(opts?.regenerate) }),
      });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setLink(String(data?.shareUrl || ''));
      setDiscoverable(Boolean(data?.discoverable));
      setCreated(true);
      try {
        const nav: any = typeof navigator !== 'undefined' ? (navigator as any) : null;
        const canAuto = nav?.permissions && typeof nav.permissions.query === 'function'
          ? (await nav.permissions.query({ name: 'clipboard-write' as any }))?.state === 'granted'
          : false;
        if (canAuto && typeof window !== 'undefined') {
          await window.navigator.clipboard?.writeText(String(data?.shareUrl || ''));
          setToast('success');
        } else {
          setToast('ready');
        }
      } catch {
        setToast('ready');
      }
    } catch (e: any) {
      // keep inline minimal alert for now
      alert(e?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/share`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed');
      setLink('');
      setCreated(false);
    } catch (e: any) {
      alert(e?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="text-sm text-neutral-400 uppercase">Share</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => createOrUpdate()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          title={created ? 'Update share link' : 'Create share link'}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
          {busy ? 'Preparing share link…' : (created ? 'Update Link' : 'Create Link')}
        </button>
        <button
          type="button"
          onClick={() => createOrUpdate({ regenerate: true })}
          disabled={busy || !created}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          title="Regenerate share token"
        >
          <RefreshCw className="h-4 w-4" />
          Regenerate
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={busy || !created}
          className="inline-flex items-center gap-2 rounded-md border border-red-700/50 bg-red-900/30 px-3 py-1.5 text-sm text-red-100 hover:bg-red-800/40 disabled:opacity-60"
          title="Revoke link"
        >
          <EyeOff className="h-4 w-4" />
          Revoke
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDiscoverable((d) => !d)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
          title="Toggle discoverability"
        >
          {discoverable ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {discoverable ? 'Discoverable' : 'Private'}
        </button>
        {link && (
          <button
            type="button"
            onClick={async () => {
              try { await window.navigator.clipboard?.writeText(link); setToast('success'); } catch { setToast('ready'); }
            }}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
            title="Copy share link"
          >
            <Copy className="h-4 w-4" />
            Copy Link
          </button>
        )}
      </div>
      {link && (
        <div className="truncate text-sm text-neutral-400" title={link}>
          {link}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-40 max-w-sm">
          {toast === 'success' && (
            <div className="rounded-md border border-green-700/40 bg-green-900/30 p-3 text-sm text-green-100 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">Link ready</div>
                  <div className="mt-0.5 text-green-200/90">Anyone with the link can view this lesson.</div>
                </div>
              </div>
            </div>
          )}
          {toast === 'ready' && (
            <div className="rounded-md border border-yellow-700/40 bg-yellow-900/30 p-3 text-sm text-yellow-100 shadow-lg backdrop-blur">
              <div className="flex items-start gap-2">
                <ClipboardX className="mt-0.5 h-4 w-4" />
                <div className="flex-1">
                  <div className="font-medium">Link ready</div>
                  <div className="mt-0.5 text-yellow-200/90">Clipboard access was blocked. Tap to copy.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



