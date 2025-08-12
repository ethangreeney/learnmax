import LectureList, { type ClientLecture } from '@/components/LectureList';
import LearnClient from './LearnClient';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import { redirect } from 'next/navigation';
import { getLecturesCached } from '@/lib/cached';

async function getData() {
  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/api/auth/signin');
  }
  const userId = session.user.id;
  const lectures = await getLecturesCached(userId);
  const clientLectures: ClientLecture[] = lectures.map((l: any) => ({
    id: l.id,
    title: l.title,
    createdAtISO: new Date(l.createdAt).toISOString(),
    lastOpenedAtISO: l.lastOpenedAt ? new Date(l.lastOpenedAt).toISOString() : null,
    subtopicCount: l._count.subtopics,
    starred: l.starred ?? false,
  }));
  return { clientLectures, total: lectures.length } as const;
}

export default async function LearnWorkspacePage() {
  const { clientLectures, total } = await getData();
  return (
    <div className="container-narrow space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Learn Workspace</h1>
        <p className="text-sm text-neutral-400">
          Paste text and create a persistent lecture. You’ll be redirected to
          the lecture page with explanations and quizzes.
        </p>
      </header>

      <LearnClient />

      <section>
        <h2 className="text-2xl font-semibold">Your Lessons</h2>
        <LectureList initialLectures={clientLectures} />
        {total >= 50 && (
          <p className="mt-2 text-sm text-neutral-500">
            Showing latest 50. Older lectures are available via search; we can add paging if you need it.
          </p>
        )}
      </section>
    </div>
  );
}
