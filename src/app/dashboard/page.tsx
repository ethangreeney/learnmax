import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BookOpen, Target, BrainCircuit, Flame } from 'lucide-react';
import { isSessionWithUser } from '@/lib/session-utils';
import LectureList, { type ClientLecture } from '@/components/LectureList';
import { Suspense } from 'react';
import { getLecturesCached, getUserStatsCached } from '@/lib/cached';

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="card flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">{label}</span>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <p className="text-4xl font-bold">{value}</p>
    </div>
  );
}

async function getData() {
  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/api/auth/signin');
  }
  const userId = session.user.id;

  const [{ user: userLite, masteredCount }, lectures] = await Promise.all([
    getUserStatsCached(userId),
    getLecturesCached(userId),
  ]);

  return { user: userLite, masteredCount, lectures };
}

export default async function Dashboard() {
  const { user, masteredCount, lectures } = await getData();
  type LectureItem = (typeof lectures)[number];
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

  return (
    <div className="container-narrow space-y-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Your Dashboard</h1>
        <p className="mt-2 text-neutral-400">
          Welcome back{user?.name ? `, ${user.name}` : ''}! Here&apos;s a
          summary of your learning journey.
        </p>
      </header>
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:col-span-2">
          <StatCard
            label="Lectures Created"
            value={lectures.length}
            icon={BookOpen}
            color="text-blue-400"
          />
          <StatCard
            label="Subtopics Mastered"
            value={masteredCount ?? 0}
            icon={Target}
            color="text-green-400"
          />
          <StatCard
            label="Learning Elo"
            value={user?.elo ?? 1000}
            icon={BrainCircuit}
            color="text-purple-400"
          />
          <StatCard
            label="Current Streak"
            value={`${user?.streak ?? 0} days`}
            icon={Flame}
            color="text-orange-400"
          />
        </div>
        <div className="card flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h3 className="text-xl font-semibold">Ready to Learn?</h3>
          <p className="text-sm text-neutral-400">
            Create a lecture from text or PDF in the Learn Workspace.
          </p>
          <Link
            href="/learn"
            className="btn-primary w-full px-6 py-3 font-semibold transition-transform hover:scale-105"
          >
            Go to Workspace
          </Link>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Your Lectures</h2>
        <Suspense
          fallback={
            <div className="mt-6 text-sm text-neutral-500">
              Loading your lectures…
            </div>
          }
        >
          {/* Already fetched above, but Suspense boundary lets the header paint instantly if cache misses */}
          <LectureList initialLectures={clientLectures} />
        </Suspense>
        {lectures.length >= 50 && (
          <p className="mt-2 text-sm text-neutral-500">
            Showing latest 50. Older lectures are available via search; we can
            add paging if you need it.
          </p>
        )}
      </section>
    </div>
  );
}
