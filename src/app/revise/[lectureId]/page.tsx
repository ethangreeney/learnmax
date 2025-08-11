import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { isSessionWithUser } from '@/lib/session-utils';
import ReviseClient from './reviseClient';

export default async function RevisePage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/api/auth/signin');
  }
  const { lectureId } = await params;
  const userId = session.user.id;

  const lecture = await prisma.lecture.findFirst({
    where: { id: lectureId, userId },
    select: {
      id: true,
      title: true,
      originalContent: true,
      subtopics: {
        orderBy: { order: 'asc' },
        select: { id: true, title: true, overview: true, explanation: true },
      },
    },
  });
  if (!lecture) notFound();

  return (
    <div className="container-narrow">
      <ReviseClient
        lecture={{
          id: lecture.id,
          title: lecture.title,
          originalContent: lecture.originalContent,
          subtopics: lecture.subtopics.map((s) => ({
            id: s.id,
            title: s.title,
            overview: s.overview || '',
            explanation: s.explanation || '',
          })),
        }}
      />
    </div>
  );
}


