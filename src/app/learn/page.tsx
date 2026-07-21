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
    <div className="container-narrow space-y-14 pb-12">
      <style>{`
        @keyframes learnmax-workspace-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .workspace-enter { animation: none !important; }
        }
      `}</style>

      <header className="workspace-enter relative max-w-4xl pt-2 motion-safe:animate-[learnmax-workspace-enter_500ms_cubic-bezier(0.22,1,0.36,1)_both]">
        <div className="mb-5 flex items-center gap-3">
          <span className="h-px w-8 bg-emerald-400/80" aria-hidden="true" />
          <p className="text-xs font-semibold tracking-[0.08em] text-emerald-400 uppercase">
            Study workspace
          </p>
        </div>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl sm:leading-[1.08]">
          Start with the source. Finish with what you can recall.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg sm:leading-8">
          Turn your own notes and readings into a focused path from explanation
          to independent recall.
        </p>
      </header>

      <section
        id="create-lesson"
        aria-labelledby="create-lesson-heading"
        className="workspace-enter scroll-mt-24 space-y-4 motion-safe:animate-[learnmax-workspace-enter_520ms_100ms_cubic-bezier(0.22,1,0.36,1)_both]"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium tracking-[0.08em] text-neutral-500 uppercase">
              01 / New lesson
            </p>
            <h2
              id="create-lesson-heading"
              className="mt-2 text-2xl font-semibold tracking-[-0.025em]"
            >
              Build from your material
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-neutral-400 sm:text-right">
            A complete section produces a stronger lesson than a topic name
            alone.
          </p>
        </div>

        <LearnClient />

        <p className="text-xs leading-5 text-neutral-500">
          You can combine pasted context with multiple PDF readings or slide
          decks in one lesson.
        </p>
      </section>

      <ol
        aria-label="How LearnMax works"
        className="workspace-enter overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/35 motion-safe:animate-[learnmax-workspace-enter_520ms_180ms_cubic-bezier(0.22,1,0.36,1)_both] sm:grid sm:grid-cols-3"
      >
        {workflow.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="group relative border-b border-neutral-800 p-5 transition-colors duration-300 last:border-b-0 hover:bg-neutral-900/55 motion-reduce:transition-none sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-300 transition-[border-color,color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:border-emerald-500/30 group-hover:text-emerald-300 motion-reduce:transform-none motion-reduce:transition-none">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-medium text-neutral-600 tabular-nums">
                  0{index + 1}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-100">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-neutral-500 transition-colors duration-300 group-hover:text-neutral-400 motion-reduce:transition-none">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <section
        aria-labelledby="your-lessons-heading"
        className="workspace-enter space-y-5 motion-safe:animate-[learnmax-workspace-enter_520ms_240ms_cubic-bezier(0.22,1,0.36,1)_both]"
      >
        <div className="flex flex-col items-start gap-3 border-b border-neutral-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.08em] text-neutral-500 uppercase">
              02 / Your library
            </p>
            <h2
              id="your-lessons-heading"
              className="mt-2 text-2xl font-semibold tracking-[-0.025em]"
            >
              Your lessons
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Continue a lesson, practise recall, or organise what you have
              saved.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              aria-hidden="true"
            />
            {total} {total === 1 ? 'lesson' : 'lessons'} saved
          </div>
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
