import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { isSessionWithUser } from '@/lib/session-utils';

type LearnPageProps = {
  params?: Promise<{ lectureId: string }>;
};

export default async function LearnPage({ params }: LearnPageProps) {
  if (!params) notFound();
  const { lectureId } = await params;

  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/api/auth/signin');
  }
  const userId = session.user.id;

  // findFirst because we need to filter by both id and userId
  const lecture = await prisma.lecture.findFirst({
    where: { id: lectureId, userId },
    include: {
      subtopics: true, // includes: id, title, order, importance, difficulty, overview, explanation, lectureId
    },
  });

  if (!lecture) {
    notFound();
  }

  type SubtopicItem = NonNullable<typeof lecture>['subtopics'][number];

  return (
    <div className="container-narrow space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{lecture.title}</h1>
        <p className="text-neutral-400">
          Created at {new Date(lecture.createdAt).toLocaleString()}
        </p>
      </header>

      <section className="space-y-4">
        {lecture.subtopics.length === 0 && (
          <div className="text-neutral-400 text-sm">
            No subtopics yet. Add some in the editor.
          </div>
        )}

        {lecture.subtopics.map((sub: SubtopicItem) => (
          <div
            key={sub.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
          >
            <h3 className="font-semibold">{sub.title}</h3>
            <p className="text-neutral-400">
              {sub.overview || sub.explanation || 'No overview available.'}
            </p>
            <p className="text-xs text-neutral-500 mt-2">
              Importance: {sub.importance} • Difficulty: {sub.difficulty}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
