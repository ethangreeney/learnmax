import Image from 'next/image';
import { BrainCircuit, Flame, Target, User as UserIcon } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getProfileForUser } from '@/lib/cached';
import ProfileClient from './ProfileClient';

type PublicProfile = {
  id: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  image: string | null;
  elo: number;
  streak: number;
  masteredCount: number;
  lifetimeLecturesCreated?: number;
  lifetimeSubtopicsMastered?: number;
  quiz: { totalAttempts: number; correct: number; accuracy: number };
  isAdmin?: boolean;
  leaderboardOptOut?: boolean;
  rank?: {
    slug: string;
    name: string;
    minElo: number;
    iconUrl: string | null;
  } | null;
};

function getRankColor(slug?: string | null): string {
  switch (slug) {
    case 'bronze':
      return 'from-amber-600 via-orange-500 to-yellow-500';
    case 'silver':
      return 'from-gray-400 via-gray-300 to-gray-200';
    case 'gold':
      return 'from-yellow-400 via-yellow-300 to-amber-300';
    case 'diamond':
      return 'from-cyan-400 via-blue-400 to-indigo-400';
    case 'master':
      return 'from-purple-400 via-pink-400 to-rose-400';
    default:
      return 'from-neutral-300 via-neutral-200 to-neutral-100';
  }
}

async function getProfile(): Promise<PublicProfile> {
  const session = await requireSession();
  const userId = (session.user as any)?.id as string;
  const me = await getProfileForUser(userId, {
    email: (session.user as any)?.email || null,
    providerImage: (session.user as any)?.image || null,
  });
  return me as PublicProfile;
}

export default async function ProfilePage() {
  const me = await getProfile();
  const rankColor = getRankColor(me.rank?.slug);

  return (
    <div className="container-narrow space-y-10">
      <section className="card relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent" />
        <div className="p-5 pb-8 md:p-6 md:pb-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="relative top-[6px] self-center">
                <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-900 ring-2 ring-neutral-800">
                  {me.image ? (
                    <Image
                      src={me.image}
                      alt="avatar"
                      width={80}
                      height={80}
                      className="h-full w-full object-cover"
                      priority
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-500">
                      <UserIcon className="h-8 w-8" />
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                    {me.name || 'Your Profile'}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full bg-neutral-900/70 px-3 py-1 text-xs ring-1 ring-neutral-800`}
                  >
                    {me.rank?.iconUrl && (
                      <Image
                        src={me.rank.iconUrl}
                        alt={me.rank.name}
                        width={16}
                        height={16}
                        className="h-4 w-4 object-contain"
                      />
                    )}
                    <span
                      className={`bg-gradient-to-r ${rankColor} bg-clip-text font-semibold text-transparent`}
                    >
                      {me.rank?.name || 'Unranked'}
                    </span>
                    <span className="text-neutral-400">Elo {me.elo}</span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-400">
                  {me.username
                    ? `@${me.username}`
                    : 'Pick a username to claim your handle'}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Lifetime: {me.lifetimeLecturesCreated ?? 0} lectures created •{' '}
                  {me.lifetimeSubtopicsMastered ?? me.masteredCount} subtopics mastered
                </p>
              </div>
            </div>

            <div className="relative top-[2px] hidden shrink-0 items-center gap-2 md:flex">
              <Chip
                icon={Flame}
                label={`${me.streak} day${me.streak === 1 ? '' : 's'} streak`}
              />
            <Chip icon={Target} label={`${me.masteredCount} mastered`} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <ProfileClient initialUser={me} />

        <div className="card p-6">
          <h2 className="mb-4 text-xl font-semibold">Learning Stats</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Subtopics Mastered"
              value={String(me.lifetimeSubtopicsMastered ?? me.masteredCount)}
              sub={me.lifetimeSubtopicsMastered !== undefined ? `Current ${me.masteredCount}` : undefined}
              icon={Target}
            />
            <Stat
              label="Accuracy"
              value={`${me.quiz.accuracy}%`}
              sub={`${me.quiz.correct}/${me.quiz.totalAttempts}`}
              icon={BrainCircuit}
            />
            <Stat label="Streak" value={String(me.streak)} icon={Flame} />
          </div>
        </div>
        {me?.isAdmin && (
          <div className="card p-6">
            <h2 className="mb-3 text-xl font-semibold">Admin Panel</h2>
            <p className="mb-4 text-sm text-neutral-400">
              You have admin access.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="/admin" className="btn-primary px-4 py-2">
                Open Admin Panel
              </a>
              <a href="/admin/ranks" className="btn-ghost px-4 py-2">
                Manage Rank Icons
              </a>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/70 px-3 py-1 text-xs ring-1 ring-neutral-800">
      <Icon className="h-3.5 w-3.5 text-neutral-300" />
      <span>{label}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-400">{label}</div>
        <Icon className="h-4 w-4 text-neutral-300" />
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
