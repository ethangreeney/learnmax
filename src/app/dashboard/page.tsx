import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BookOpen, Target, BrainCircuit, Flame } from 'lucide-react';
import { isSessionWithUser } from '@/lib/session-utils';
import LectureList, { type ClientLecture } from '@/components/LectureList';

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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">{label}</span>
        <Icon className={`w-6 h-6 ${color}`} />
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

  const [user, lectures] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        masteredSubtopics: true, // ensure this relation is loaded
      },
    }),
    prisma.lecture.findMany({
      where: { userId },
      orderBy: [
        { starred: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        _count: { select: { subtopics: true } },
      },
    }),
  ]);

  return { user, lectures };
}

export default async function Dashboard() {
  const { user, lectures } = await getData();
  type LectureItem = typeof lectures[number];
  const clientLectures: ClientLecture[] = lectures.map((l: any) => ({
    id: l.id,
    title: l.title,
    createdAtISO: new Date(l.createdAt).toISOString(),
    subtopicCount: l._count.subtopics,
    starred: l.starred ?? false,
  }));

  return (
    <div className="container-narrow space-y-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Your Dashboard</h1>
        <p className="text-neutral-400 mt-2">
          Welcome back{user?.name ? `, ${user.name}` : ''}! Here&apos;s a summary of your learning journey.
        </p>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatCard
            label="Lectures Created"
            value={lectures.length}
            icon={BookOpen}
            color="text-blue-400"
          />
          <StatCard
            label="Subtopics Mastered"
            value={user?.masteredSubtopics ? user.masteredSubtopics.length : 0}
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
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 flex flex-col items-center justify-center text-center gap-4">
          <h3 className="text-xl font-semibold">Ready to Learn?</h3>
          <p className="text-neutral-400 text-sm">
            Create a lecture from text or PDF in the Learn Workspace.
          </p>
          <Link
            href="/learn"
            className="w-full rounded-md bg-white px-6 py-3 text-black font-semibold shadow-md transition-transform hover:scale-105"
          >
            Go to Workspace
          </Link>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Your Lectures</h2>
        <LectureList initialLectures={clientLectures} />
      </section>
    </div>
  );
}
