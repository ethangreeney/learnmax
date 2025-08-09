'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export default function DeleteLectureButton({
  lectureId,
  onDeleted,
}: {
  lectureId: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (busy || isPending) return;
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this lecture? This cannot be undone.') : false;
    if (!ok) return;

    try {
      setBusy(true);
      // Optimistic removal: update UI immediately
      if (onDeleted) onDeleted();
      // Perform delete in background
      const res = await fetch(`/api/lectures/${lectureId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to delete');
      }
      // If no optimistic handler, fall back to refresh
      if (!onDeleted) startTransition(() => router.refresh());
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert((e as Error)?.message || 'Failed to delete');
      // Re-sync UI from server in case optimistic update removed item locally
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy || isPending}
      className="inline-flex items-center gap-2 rounded-md border border-red-700/50 bg-red-900/30 px-3 py-1.5 text-sm text-red-100 hover:bg-red-800/40 disabled:opacity-60"
      aria-disabled={busy || isPending}
      title="Delete lecture"
    >
      <Trash2 className="w-4 h-4" />
      Delete
    </button>
  );
}


