'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Star, StarOff, Pencil, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import DeleteLectureButton from '@/components/DeleteLectureButton';

export type ClientLecture = {
  id: string;
  title: string;
  createdAtISO: string; // serialized for client component props
  lastOpenedAtISO: string | null;
  subtopicCount: number;
  starred: boolean;
};

export default function LectureList({
  initialLectures,
}: {
  initialLectures: ClientLecture[];
}) {
  const [lectures, setLectures] = useState<ClientLecture[]>(initialLectures);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<null | { type: 'success' | 'error'; message: string }>(null);
  const noticeKey = useMemo(() => (notice ? `${notice.type}:${notice.message}` : 'none'), [notice]);
  // Keep local state in sync when server-provided lectures change (e.g., after navigation)
  useEffect(() => {
    setLectures(initialLectures);
    setDeletingIds(new Set());
  }, [initialLectures]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [noticeKey]);

  return (
    <div className="mt-6 space-y-4">
      {lectures.length === 0 && (
        <div className="text-sm text-neutral-400">
          No lectures yet. Create one in the Learn Workspace.
        </div>
      )}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            notice.type === 'success'
              ? 'border-green-700 bg-green-900/30 text-green-200'
              : 'border-red-700 bg-red-900/30 text-red-200'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{notice.message}</span>
        </div>
      )}
      {lectures.map((lec) => {
        const isDeleting = deletingIds.has(lec.id);
        return (
          <div
            key={lec.id}
            className={`relative card flex items-center justify-between p-4 transition-colors hover:bg-neutral-900 ${
              isDeleting ? 'opacity-70' : ''
            }`}
          >
            <div className={isDeleting ? 'pointer-events-none' : ''}>
              <h4 className="font-semibold">{lec.title}</h4>
              <p className="text-sm text-neutral-400">
                {new Date(lec.createdAtISO).toLocaleString()} • {lec.subtopicCount}{' '}
                subtopics
              </p>
            </div>
            <div className={`flex items-center gap-3 ${isDeleting ? 'pointer-events-none' : ''}`}>
              <Link
                href={`/learn/${lec.id}`}
                className="text-sm font-medium text-white hover:underline"
              >
                Open
              </Link>
              <Link
                href={`/revise/${lec.id}`}
                className="text-sm font-medium text-white hover:underline"
              >
                Revise
              </Link>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    const next = !lec.starred;
                    setLectures((prev) => {
                      const updated = prev.map((p) =>
                        p.id === lec.id ? { ...p, starred: next } : p
                      );
                      // Reorder: starred first, then by lastOpenedAt desc (fallback createdAt desc)
                      return [...updated].sort((a, b) => {
                        if (a.starred !== b.starred) return b.starred ? 1 : -1;
                        const aOpen = a.lastOpenedAtISO ? Date.parse(a.lastOpenedAtISO) : 0;
                        const bOpen = b.lastOpenedAtISO ? Date.parse(b.lastOpenedAtISO) : 0;
                        if (aOpen !== bOpen) return bOpen - aOpen;
                        const aCreated = Date.parse(a.createdAtISO);
                        const bCreated = Date.parse(b.createdAtISO);
                        return bCreated - aCreated;
                      });
                    });
                    const res = await fetch(`/api/lectures/${lec.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ starred: next }),
                    });
                    if (!res.ok) {
                      throw new Error('Failed');
                    }
                  } catch {
                    // Revert pessimistically by refetching state from server on next load
                  }
                }}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  lec.starred
                    ? 'border-yellow-500/40 bg-yellow-900/20 text-yellow-200 hover:bg-yellow-900/30'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                }`}
                title={lec.starred ? 'Unstar' : 'Star'}
              >
                {lec.starred ? (
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ) : (
                  <StarOff className="h-4 w-4" />
                )}
                {lec.starred ? 'Starred' : 'Star'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  const newTitle =
                    typeof window !== 'undefined'
                      ? window.prompt('Rename lecture', lec.title)
                      : null;
                  if (!newTitle) return;
                  const t = newTitle.trim();
                  if (t.length < 3) {
                    
                    alert('Title must be at least 3 characters.');
                    return;
                  }
                  try {
                    setLectures((prev) =>
                      prev.map((p) => (p.id === lec.id ? { ...p, title: t } : p))
                    );
                    const res = await fetch(`/api/lectures/${lec.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: t }),
                    });
                    if (!res.ok) {
                      throw new Error('Failed');
                    }
                  } catch (e) {
                    
                    alert((e as Error)?.message || 'Failed to rename');
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
                title="Rename"
              >
                <Pencil className="h-4 w-4" /> Rename
              </button>
              <DeleteLectureButton
                lectureId={lec.id}
                onDeleting={() =>
                  setDeletingIds((prev) => new Set(prev).add(lec.id))
                }
                onDeleteSuccess={() => {
                  setLectures((prev) => prev.filter((l) => l.id !== lec.id));
                  setDeletingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(lec.id);
                    return next;
                  });
                  setNotice({ type: 'success', message: 'Lecture deleted.' });
                }}
                onDeleteError={(msg) => {
                  setDeletingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(lec.id);
                    return next;
                  });
                  setNotice({ type: 'error', message: msg || "Couldn't delete the lecture. Try again." });
                }}
              />
            </div>

            {isDeleting && (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/50"
                aria-live="polite"
                aria-label="Deleting…"
              >
                <div className="flex items-center gap-2 text-sm text-neutral-200">
                  <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
