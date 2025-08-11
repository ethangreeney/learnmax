import Image from 'next/image';
import { BrainCircuit, Flame, Target, User as UserIcon } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getProfileForUser } from '@/lib/cached';
import { getRankGradient } from '@/lib/ranks';
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
  const rankColor = getRankGradient(me.rank?.slug);

  return (
    <div className="container-narrow space-y-10">
      <section className="card relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent" />
        <div className="p-5 pb-8 md:p-6 md:pb-10">
          <div className="flex items-center justify-between gap-6">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="relative top-[2px] self-center">
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

            <div className="relative top-[8px] hidden shrink-0 items-center gap-3 md:flex">
              <RankBadge
                name={me.rank?.name || 'Unranked'}
                slug={me.rank?.slug || null}
                iconUrl={me.rank?.iconUrl || null}
                elo={me.elo}
                rankColorClass={rankColor}
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

function RankBadge({
  name,
  slug,
  iconUrl,
  elo,
  rankColorClass,
}: {
  name: string;
  slug: string | null | undefined;
  iconUrl: string | null | undefined;
  elo: number;
  rankColorClass: string;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 px-1">
      {iconUrl ? (
        <Image
          src={iconUrl}
          alt={name}
          width={72}
          height={72}
          className="relative top-[6px] h-[72px] w-[72px] object-contain"
        />)
        : (
          <div className="relative top-[6px] h-[72px] w-[72px] rounded-md bg-neutral-800" />
        )}
      <div className={`relative top-[4px] bg-gradient-to-r ${rankColorClass} bg-clip-text text-sm font-semibold leading-tight text-transparent`}>
        {name}
      </div>
      <div className="text-xs leading-tight text-neutral-400">Elo {elo}</div>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  className,
}: {
  icon: React.ElementType;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center gap-2 rounded-full bg-neutral-900/70 px-3 py-1 text-xs ring-1 ring-neutral-800 ${className ?? ''}`}
    >
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
