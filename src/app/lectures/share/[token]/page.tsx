import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import SharePreviewView from '@/components/SharePreviewView';
import { headers } from 'next/headers';

type PreviewQuestion = { prompt: string; options: string[] };
type PreviewSubtopic = {
  order: number;
  title: string;
  overview: string;
  explanation?: string;
  questions: PreviewQuestion[];
  shortPrompt?: string;
};
type PreviewData = {
  title: string;
  author: string;
  subtopics: PreviewSubtopic[];
};

async function loadPreviewDirect(token: string): Promise<PreviewData | null> {
  try {
    const row = await prisma.lecture.findUnique({
      where: { shareToken: token },
      select: {
        id: true,
        title: true,
        shareRevokedAt: true,
        user: { select: { name: true, username: true } },
        subtopics: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            order: true,
            title: true,
            overview: true,
            explanation: true,
          },
        },
      },
    });
    if (!row || row.shareRevokedAt) return null;
    const ids = row.subtopics.map((s) => s.id);
    const mcqs = await prisma.quizQuestion.findMany({
      where: { subtopicId: { in: ids } },
      select: { subtopicId: true, prompt: true, options: true },
      orderBy: { id: 'asc' },
    });
    const shorts = await prisma.shortAnswerPrompt.findMany({
      where: { lectureId: row.id },
      select: { subtopicId: true, prompt: true },
    });
    const shortBySub: Record<string, string> = Object.fromEntries(
      shorts.map((p) => [p.subtopicId, p.prompt])
    );
    const qBySub: Record<string, PreviewQuestion[]> = {};
    for (const q of mcqs) {
      const k = q.subtopicId;
      (qBySub[k] ||= []).push({
        prompt: q.prompt,
        options: (q.options as unknown as string[]) || [],
      });
    }
    const subtopics: PreviewSubtopic[] = row.subtopics.map((s) => ({
      order: s.order,
      title: s.title,
      overview: s.overview || '',
      explanation: s.explanation || undefined,
      questions: qBySub[s.id] || [],
      shortPrompt: shortBySub[s.id],
    }));
    return {
      title: row.title,
      author: row.user?.username || row.user?.name || 'Unknown',
      subtopics,
    };
  } catch {
    return null;
  }
}

export default async function SharedPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadPreviewDirect(token);
  if (!data) notFound();

  const session = await getServerSession(authOptions);
  const isSignedIn = Boolean(session?.user);

  async function importAction(formData: FormData) {
    'use server';
    const s = String(formData.get('s') || '0');
    if (!isSignedIn) {
      redirect(
        `/login?callbackUrl=${encodeURIComponent(`/lectures/share/${token}`)}`
      );
    }
    const h = await headers();
    const proto = h.get('x-forwarded-proto') || 'http';
    const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
    const origin = `${proto}://${host}`;
    const url = `${origin}/api/lectures/import`;
    const cookie = h.get('cookie') || '';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: cookie },
      cache: 'no-store',
      body: JSON.stringify({ token }),
    });
    const out = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(out?.error || 'Import failed');
    redirect(`/learn/${out.id}#s=${encodeURIComponent(s)}`);
  }

  return <SharePreviewView data={data} onImport={importAction} />;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
