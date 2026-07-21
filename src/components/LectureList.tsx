'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  Layers3,
  Loader2,
  Pencil,
  Search,
  Star,
  X,
} from 'lucide-react';
import YourLessonActions from '@/components/YourLessonActions';
import DeleteLectureButton from '@/components/DeleteLectureButton';

export type ClientLecture = {
  id: string;
  title: string;
  createdAtISO: string;
  lastOpenedAtISO: string | null;
  subtopicCount: number;
  starred: boolean;
};

type Filter = 'all' | 'starred' | 'needs-setup';
type Sort = 'recent' | 'newest' | 'title';
type Notice = { type: 'success' | 'error'; message: string };

const dateFormatter = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const fullDateFormatter = new Intl.DateTimeFormat('en-NZ', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function lessonNeedsSetup(lecture: ClientLecture): boolean {
  return (
    lecture.subtopicCount === 0 ||
    /^generating lesson/i.test(lecture.title.trim())
  );
}

function lessonTitle(lecture: ClientLecture): string {
  if (/^generating lesson/i.test(lecture.title.trim())) {
    return 'Finish setting up this lesson';
  }
  return lecture.title;
}

function timestamp(lecture: ClientLecture): number {
  const value = lecture.lastOpenedAtISO || lecture.createdAtISO;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createdTimestamp(lecture: ClientLecture): number {
  const parsed = Date.parse(lecture.createdAtISO);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime())
    ? dateFormatter.format(parsed)
    : 'Date unavailable';
}

function fullDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime())
    ? `${fullDateFormatter.format(parsed)} UTC`
    : 'Date unavailable';
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : fallback;
}

export default function LectureList({
  initialLectures,
  totalCount = initialLectures.length,
}: {
  initialLectures: ClientLecture[];
  totalCount?: number;
}) {
  const [lectures, setLectures] = useState<ClientLecture[]>(initialLectures);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [pendingStarIds, setPendingStarIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    setLectures(initialLectures);
    setDeletingIds(new Set());
    setPendingStarIds(new Set());
    setEditingId(null);
    setDraftTitle('');
  }, [initialLectures]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const visibleLectures = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matches = lectures.filter((lecture) => {
      const searchableTitle =
        `${lecture.title} ${lessonTitle(lecture)}`.toLocaleLowerCase();
      if (normalizedQuery && !searchableTitle.includes(normalizedQuery)) {
        return false;
      }
      if (filter === 'starred') return lecture.starred;
      if (filter === 'needs-setup') return lessonNeedsSetup(lecture);
      return true;
    });

    return [...matches].sort((a, b) => {
      if (sort === 'title') {
        return lessonTitle(a).localeCompare(lessonTitle(b));
      }
      if (sort === 'newest') {
        return createdTimestamp(b) - createdTimestamp(a);
      }
      return timestamp(b) - timestamp(a);
    });
  }, [filter, lectures, query, sort]);

  const hasActiveFilters = query.trim().length > 0 || filter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setFilter('all');
  };

  const toggleStar = async (lecture: ClientLecture) => {
    if (pendingStarIds.has(lecture.id) || deletingIds.has(lecture.id)) return;

    const nextStarred = !lecture.starred;
    setPendingStarIds((previous) => new Set(previous).add(lecture.id));
    setLectures((previous) =>
      previous.map((item) =>
        item.id === lecture.id ? { ...item, starred: nextStarred } : item
      )
    );

    try {
      const response = await fetch(`/api/lectures/${lecture.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: nextStarred }),
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, 'Could not update this lesson.')
        );
      }
      setNotice({
        type: 'success',
        message: nextStarred
          ? 'Lesson added to starred.'
          : 'Lesson removed from starred.',
      });
    } catch (error) {
      setLectures((previous) =>
        previous.map((item) =>
          item.id === lecture.id ? { ...item, starred: lecture.starred } : item
        )
      );
      setNotice({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not update this lesson.',
      });
    } finally {
      setPendingStarIds((previous) => {
        const next = new Set(previous);
        next.delete(lecture.id);
        return next;
      });
    }
  };

  const beginRename = (lecture: ClientLecture) => {
    setEditingId(lecture.id);
    setDraftTitle(lessonTitle(lecture));
    setNotice(null);
  };

  const cancelRename = () => {
    if (renameSaving) return;
    setEditingId(null);
    setDraftTitle('');
  };

  const saveRename = async (
    event: FormEvent<HTMLFormElement>,
    lecture: ClientLecture
  ) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (title.length < 3) {
      setNotice({
        type: 'error',
        message: 'Lesson titles need at least 3 characters.',
      });
      return;
    }
    if (title === lecture.title) {
      cancelRename();
      return;
    }

    setRenameSaving(true);
    try {
      const response = await fetch(`/api/lectures/${lecture.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        throw new Error(
          await responseError(response, 'Could not rename this lesson.')
        );
      }
      setLectures((previous) =>
        previous.map((item) =>
          item.id === lecture.id ? { ...item, title } : item
        )
      );
      setEditingId(null);
      setDraftTitle('');
      setNotice({ type: 'success', message: 'Lesson renamed.' });
    } catch (error) {
      setNotice({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not rename this lesson.',
      });
    } finally {
      setRenameSaving(false);
    }
  };

  if (lectures.length === 0) {
    return (
      <div className="card flex flex-col items-center px-6 py-10 text-center sm:py-12">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
          <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-lg font-semibold">
          Your first lesson starts here
        </h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400">
          Add material above and LearnMax will organise it into focused sections
          you can understand and practise.
        </p>
        <a href="#create-lesson" className="btn-primary mt-5">
          Choose study material
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
          className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg shadow-black/10 motion-safe:animate-[learnmax-workspace-enter_250ms_ease-out_both] ${
            notice.type === 'success'
              ? 'border-emerald-700/50 bg-emerald-950/50 text-emerald-100'
              : 'border-red-700/50 bg-red-950/50 text-red-100'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          )}
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-auto rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {lectures.length > 1 && (
        <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/35 p-3 shadow-[0_18px_50px_-40px_rgba(0,0,0,0.9)]">
          <div
            className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-neutral-600/70 to-transparent"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1" role="search">
              <label htmlFor="lesson-search" className="sr-only">
                Search your lessons
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500"
                aria-hidden="true"
              />
              <input
                id="lesson-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search lessons"
                className="input h-10 pl-9 transition-[box-shadow,background-color] duration-200 hover:bg-neutral-900 focus:bg-neutral-900 focus:ring-emerald-500/60 motion-reduce:transition-none"
              />
            </div>

            <div
              className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/60 p-1"
              aria-label="Filter lessons"
            >
              {(
                [
                  ['all', 'All'],
                  ['starred', 'Starred'],
                  ['needs-setup', 'Needs setup'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${
                    filter === value
                      ? 'bg-neutral-700 text-white shadow-sm shadow-black/30'
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="lesson-sort" className="text-xs text-neutral-500">
                Sort
              </label>
              <select
                id="lesson-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                className="select h-10 min-w-36 cursor-pointer transition-colors hover:bg-neutral-900 motion-reduce:transition-none"
              >
                <option value="recent">Recently used</option>
                <option value="newest">Newest created</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
          </div>

          <p className="mt-2 px-1 text-xs text-neutral-500" aria-live="polite">
            {hasActiveFilters
              ? `${visibleLectures.length} ${visibleLectures.length === 1 ? 'match' : 'matches'} in your ${lectures.length} most recent lessons`
              : `${lectures.length} most recent ${lectures.length === 1 ? 'lesson' : 'lessons'}`}
            {totalCount > lectures.length ? ` · ${totalCount} total` : ''}.
          </p>
        </div>
      )}

      {visibleLectures.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <Search
            className="mx-auto h-5 w-5 text-neutral-500"
            aria-hidden="true"
          />
          <h3 className="mt-3 font-medium">No matching lessons</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Try a different title or clear the current filters.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-ghost mt-4"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleLectures.map((lecture, index) => {
            const isDeleting = deletingIds.has(lecture.id);
            const isStarPending = pendingStarIds.has(lecture.id);
            const needsSetup = lessonNeedsSetup(lecture);
            const displayTitle = lessonTitle(lecture);
            const activityISO = lecture.lastOpenedAtISO || lecture.createdAtISO;
            const activityLabel = lecture.lastOpenedAtISO
              ? 'Opened'
              : 'Created';

            return (
              <li
                key={lecture.id}
                className="motion-safe:animate-[learnmax-workspace-enter_420ms_cubic-bezier(0.22,1,0.36,1)_both]"
                style={{ animationDelay: `${Math.min(index * 45, 225)}ms` }}
              >
                <article
                  aria-label={displayTitle}
                  className={`group/lesson card relative overflow-visible p-4 transition-[border-color,background-color,box-shadow,opacity,transform] duration-300 motion-reduce:transform-none motion-reduce:transition-none sm:p-5 ${
                    isDeleting
                      ? 'opacity-70'
                      : 'hover:-translate-y-0.5 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-[0_18px_44px_-30px_rgba(0,0,0,0.85)]'
                  }`}
                >
                  <div
                    className={`absolute top-5 bottom-5 left-0 w-px transition-colors duration-300 motion-reduce:transition-none ${
                      needsSetup
                        ? 'bg-amber-400/60'
                        : lecture.starred
                          ? 'bg-yellow-400/45'
                          : 'bg-neutral-700/70 group-hover/lesson:bg-emerald-400/45'
                    }`}
                    aria-hidden="true"
                  />
                  <div className={isDeleting ? 'pointer-events-none' : ''}>
                    <div className="flex items-start gap-3">
                      <span
                        className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-[border-color,color,transform] duration-300 motion-reduce:transform-none motion-reduce:transition-none sm:inline-flex ${
                          needsSetup
                            ? 'border-amber-500/25 bg-amber-500/8 text-amber-300'
                            : 'border-neutral-700 bg-neutral-900 text-neutral-500 group-hover/lesson:-translate-y-0.5 group-hover/lesson:border-emerald-500/25 group-hover/lesson:text-emerald-300'
                        }`}
                      >
                        {needsSetup ? (
                          <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <BookOpenCheck
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {needsSetup && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                              <AlertCircle
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              Needs setup
                            </span>
                          )}
                          {lecture.starred && (
                            <span className="text-[11px] font-medium text-yellow-300">
                              Starred
                            </span>
                          )}
                        </div>

                        {editingId === lecture.id ? (
                          <form
                            onSubmit={(event) =>
                              void saveRename(event, lecture)
                            }
                            className="flex max-w-xl flex-col gap-2 sm:flex-row"
                          >
                            <label
                              htmlFor={`rename-${lecture.id}`}
                              className="sr-only"
                            >
                              New title for {displayTitle}
                            </label>
                            <input
                              id={`rename-${lecture.id}`}
                              value={draftTitle}
                              onChange={(event) =>
                                setDraftTitle(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') cancelRename();
                              }}
                              maxLength={160}
                              disabled={renameSaving}
                              autoFocus
                              className="input h-10 min-w-0 flex-1"
                            />
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={
                                  renameSaving || draftTitle.trim().length < 3
                                }
                                className="btn-primary h-10 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {renameSaving ? (
                                  <Loader2
                                    className="h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <Check
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                )}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelRename}
                                disabled={renameSaving}
                                className="btn-ghost h-10 px-3"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <h3
                            className="truncate text-lg font-semibold tracking-tight text-neutral-50"
                            title={displayTitle}
                          >
                            <Link
                              href={`/learn/${lecture.id}`}
                              className="inline-flex max-w-full items-center gap-2 transition-colors hover:text-emerald-300 motion-reduce:transition-none"
                            >
                              <span className="truncate">{displayTitle}</span>
                              <ArrowRight
                                className="h-4 w-4 shrink-0 translate-x-0 opacity-0 transition-[opacity,transform] duration-200 group-hover/lesson:translate-x-0.5 group-hover/lesson:opacity-70 motion-reduce:transform-none motion-reduce:transition-none"
                                aria-hidden="true"
                              />
                            </Link>
                          </h3>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400">
                          <time
                            dateTime={activityISO}
                            title={`${activityLabel} ${fullDate(activityISO)}. Created ${fullDate(lecture.createdAtISO)}.`}
                            className="inline-flex items-center gap-1.5"
                          >
                            <Clock3
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {activityLabel} {shortDate(activityISO)}
                          </time>
                          <span aria-hidden="true" className="text-neutral-700">
                            •
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Layers3
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {lecture.subtopicCount === 0
                              ? 'No sections yet'
                              : `${lecture.subtopicCount} ${
                                  lecture.subtopicCount === 1
                                    ? 'section'
                                    : 'sections'
                                }`}
                          </span>
                        </div>

                        {needsSetup && (
                          <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-100/70">
                            Open this lesson to finish building its study plan.
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => void toggleStar(lecture)}
                        disabled={isStarPending || isDeleting}
                        aria-pressed={lecture.starred}
                        aria-label={
                          lecture.starred
                            ? `Remove ${displayTitle} from starred`
                            : `Add ${displayTitle} to starred`
                        }
                        title={
                          lecture.starred
                            ? 'Remove from starred'
                            : 'Add to starred'
                        }
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-0.5 active:scale-95 disabled:cursor-wait disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none ${
                          lecture.starred
                            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/20'
                            : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-100'
                        }`}
                      >
                        {isStarPending ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Star
                            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${lecture.starred ? 'scale-105 fill-current' : ''}`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 border-t border-neutral-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/learn/${lecture.id}`}
                          className={
                            needsSetup
                              ? 'btn-primary group/action h-9 px-3'
                              : 'group/action inline-flex h-9 items-center justify-center gap-2 rounded-md bg-neutral-100 px-3 text-sm font-medium text-neutral-950 transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-white active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none'
                          }
                        >
                          {needsSetup ? 'Finish setup' : 'Continue'}
                          <ArrowRight
                            className="h-4 w-4 transition-transform duration-200 group-hover/action:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                            aria-hidden="true"
                          />
                        </Link>
                        {!needsSetup && (
                          <Link
                            href={`/revise/${lecture.id}`}
                            className="btn-ghost h-9 px-3 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none"
                          >
                            Practise recall
                          </Link>
                        )}
                      </div>

                      <div
                        className="flex flex-wrap items-center gap-2 sm:justify-end"
                        aria-label={`Manage ${displayTitle}`}
                      >
                        <button
                          type="button"
                          onClick={() => beginRename(lecture)}
                          disabled={editingId !== null || isDeleting}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-300 transition-[background-color,color,transform] hover:-translate-y-0.5 hover:bg-neutral-800 hover:text-white active:translate-y-0 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
                          aria-label={`Rename ${displayTitle}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Rename
                        </button>
                        <div className="[&>div>button]:h-9 [&>div>button]:w-9 [&>div>button]:p-0">
                          <YourLessonActions lectureId={lecture.id} />
                        </div>
                        <div className="[&>button]:h-9 [&>button]:w-9 [&>button]:gap-0 [&>button]:p-0 [&>button]:text-[0px]">
                          <DeleteLectureButton
                            lectureId={lecture.id}
                            confirmMessage={`Delete “${displayTitle}”? This lesson and its progress will be permanently removed.`}
                            onDeleting={() =>
                              setDeletingIds((previous) =>
                                new Set(previous).add(lecture.id)
                              )
                            }
                            onDeleteSuccess={() => {
                              setLectures((previous) =>
                                previous.filter(
                                  (item) => item.id !== lecture.id
                                )
                              );
                              setDeletingIds((previous) => {
                                const next = new Set(previous);
                                next.delete(lecture.id);
                                return next;
                              });
                              setNotice({
                                type: 'success',
                                message: 'Lesson deleted.',
                              });
                            }}
                            onDeleteError={(message) => {
                              setDeletingIds((previous) => {
                                const next = new Set(previous);
                                next.delete(lecture.id);
                                return next;
                              });
                              setNotice({
                                type: 'error',
                                message:
                                  message ||
                                  'Could not delete this lesson. Try again.',
                              });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {isDeleting && (
                    <div
                      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-black/70 backdrop-blur-[1px]"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-200 shadow-xl">
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Deleting lesson…
                      </div>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
