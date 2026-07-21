import LectureList, { type ClientLecture } from '@/components/LectureList';
import LearnClient from './LearnClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { redirect } from 'next/navigation';
import { getLecturesCached } from '@/lib/cached';
import prisma from '@/lib/prisma';
import { BrainCircuit, FileStack, ListChecks } from 'lucide-react';

async function getData() {
  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/login?callbackUrl=/learn');
  }
  const userId = session.user.id;
  const [lectures, total] = await Promise.all([
    getLecturesCached(userId),
    prisma.lecture.count({ where: { userId } }),
  ]);
  const clientLectures: ClientLecture[] = lectures.map((l: any) => ({
    id: l.id,
    title: l.title,
    createdAtISO: new Date(l.createdAt).toISOString(),
    lastOpenedAtISO: l.lastOpenedAt
      ? new Date(l.lastOpenedAt).toISOString()
      : null,
    subtopicCount: l._count.subtopics,
    starred: l.starred ?? false,
  }));
  return { clientLectures, total } as const;
}

const workflow = [
  {
    icon: FileStack,
    title: 'Bring your source',
    description: 'Paste notes, attach PDFs, or combine both.',
  },
  {
    icon: ListChecks,
    title: 'Learn in focused steps',
    description: 'Work through the ideas in a clear sequence.',
  },
  {
    icon: BrainCircuit,
    title: 'Prove what you know',
    description: 'Use active recall to find and close gaps.',
  },
] as const;

export default async function LearnWorkspacePage() {
  const { clientLectures, total } = await getData();
  return (
    <div className="container-narrow space-y-12 pb-10">
      <header className="max-w-3xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-emerald-400 uppercase">
          Study workspace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Turn your study material into something you can master.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-neutral-400">
          Build a guided lesson from the material you already have, then use
          explanation and active recall to turn recognition into understanding.
        </p>
      </header>

      <section
        id="create-lesson"
        aria-labelledby="create-lesson-heading"
        className="scroll-mt-24 space-y-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              New lesson
            </p>
            <h2
              id="create-lesson-heading"
              className="mt-1 text-2xl font-semibold tracking-tight"
            >
              What are you studying?
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-neutral-400 sm:text-right">
            Include the complete section you want to learn for a more useful
            lesson than a topic name alone.
          </p>
        </div>

        <LearnClient />

        <p className="text-xs leading-5 text-neutral-500">
          You can combine pasted context with multiple PDF readings or slide
          decks in one lesson.
        </p>
      </section>

      <ol aria-label="How LearnMax works" className="grid gap-3 sm:grid-cols-3">
        {workflow.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="rounded-xl border border-neutral-800 bg-neutral-900/35 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-100">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">
                    {step.description}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="your-lessons-heading" className="space-y-5">
        <div className="flex flex-col items-start gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Your library
            </p>
            <h2
              id="your-lessons-heading"
              className="mt-1 text-2xl font-semibold tracking-tight"
            >
              Your lessons
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Continue a lesson, practise recall, or organise what you have
              saved.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-sm text-neutral-300">
            {total} {total === 1 ? 'lesson' : 'lessons'}
          </span>
        </div>

        <LectureList initialLectures={clientLectures} totalCount={total} />

        {total > clientLectures.length && (
          <p className="text-sm text-neutral-500">
            Showing your {clientLectures.length} most recent lessons out of{' '}
            {total}.
          </p>
        )}
      </section>
    </div>
  );
}
