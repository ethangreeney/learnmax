'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Star, StarOff, Pencil } from 'lucide-react';
import DeleteLectureButton from '@/components/DeleteLectureButton';

export type ClientLecture = {
  id: string;
  title: string;
  createdAtISO: string; // serialized for client component props
  lastOpenedAtISO: string | null;
  subtopicCount: number;
  starred: boolean;
};

export default function LectureList({ initialLectures }: { initialLectures: ClientLecture[] }) {
  const [lectures, setLectures] = useState<ClientLecture[]>(initialLectures);
  // Keep local state in sync when server-provided lectures change (e.g., after navigation)
  useEffect(() => {
    setLectures(initialLectures);
  }, [initialLectures]);

  return (
    <div className="mt-6 space-y-4">
      {lectures.length === 0 && (
        <div className="text-neutral-400 text-sm">No lectures yet. Create one in the Learn Workspace.</div>
      )}
      {lectures.map((lec) => (
        <div key={lec.id} className="card p-4 flex items-center justify-between hover:bg-neutral-900 transition-colors">
          <div>
            <h4 className="font-semibold">{lec.title}</h4>
            <p className="text-sm text-neutral-400">
              {new Date(lec.createdAtISO).toLocaleString()} • {lec.subtopicCount} subtopics
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/learn/${lec.id}`} className="text-sm font-medium text-white hover:underline">
              Open
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  const next = !lec.starred;
                  setLectures((prev) => {
                    const updated = prev.map((p) => (p.id === lec.id ? { ...p, starred: next } : p));
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
              {lec.starred ? <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> : <StarOff className="w-4 h-4" />}
              {lec.starred ? 'Starred' : 'Star'}
            </button>
            <button
              type="button"
              onClick={async () => {
                const newTitle = typeof window !== 'undefined' ? window.prompt('Rename lecture', lec.title) : null;
                if (!newTitle) return;
                const t = newTitle.trim();
                if (t.length < 3) {
                  // eslint-disable-next-line no-alert
                  alert('Title must be at least 3 characters.');
                  return;
                }
                try {
                  setLectures((prev) => prev.map((p) => (p.id === lec.id ? { ...p, title: t } : p)));
                  const res = await fetch(`/api/lectures/${lec.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: t }),
                  });
                  if (!res.ok) {
                    throw new Error('Failed');
                  }
                } catch (e) {
                  // eslint-disable-next-line no-alert
                  alert((e as Error)?.message || 'Failed to rename');
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
              title="Rename"
            >
              <Pencil className="w-4 h-4" /> Rename
            </button>
            <DeleteLectureButton
              lectureId={lec.id}
              onDeleted={() => setLectures((prev) => prev.filter((l) => l.id !== lec.id))}
            />
          </div>
        </div>
      ))}
    </div>
  );
}


