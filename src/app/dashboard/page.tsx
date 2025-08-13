import Link from 'next/link';
import Image from 'next/image';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BookOpen, Target, BrainCircuit, Flame, User as UserIcon, ArrowRight, Star } from 'lucide-react';
import { isSessionWithUser } from '@/lib/session-utils';
import type { ClientLecture } from '@/components/LectureList';
import { getLecturesCached, getUserStatsCached, getProfileForUser } from '@/lib/cached';
import { getRanksSafe, getRankGradient } from '@/lib/ranks';
import ProfileClient from '@/app/profile/ProfileClient';
import RankGuide from '@/components/RankGuide';

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="card flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">{label}</span>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <p className="text-4xl font-bold">{value}</p>
      {sub && <p className="-mt-2 text-sm text-neutral-500">{sub}</p>}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  try {
    const now = Date.now();
    const then = Date.parse(iso);
    const diff = Math.max(0, now - then);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return 'just now';
    if (diff < hour) {
      const m = Math.round(diff / minute);
      return `${m} min ago`;
    }
    if (diff < day) {
      const h = Math.round(diff / hour);
      return `${h} hr${h === 1 ? '' : 's'} ago`;
    }
    const d = Math.round(diff / day);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  } catch {
    return '';
  }
}

async function getData() {
  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/api/auth/signin');
  }
  const userId = session.user.id;
  const email = (session.user as any)?.email || null;
  const providerImage = (session.user as any)?.image || null;

  const [stats, lectures, ranks] = await Promise.all([
    getUserStatsCached(userId),
    getLecturesCached(userId, { take: 15 }),
    getRanksSafe(),
  ]);
  // Reuse fetched stats and ranks when building the public profile object
  const me = await getProfileForUser(userId, { email, providerImage, stats, ranks, includeQuiz: false });

  const sorted = [...ranks].sort((a, b) => a.minElo - b.minElo);
  const currentIndex = (() => {
    let idx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if ((me as any).elo >= sorted[i].minElo) idx = i; else break;
    }
    return idx;
  })();
  const currentRank = sorted[currentIndex] ?? null;
  const nextRank = sorted[currentIndex + 1] ?? null;
  const toNext = nextRank ? Math.max(0, nextRank.minElo - (me as any).elo) : null;
  const denom = nextRank ? Math.max(1, nextRank.minElo - (currentRank?.minElo ?? 0)) : 1;
  const progressPct = nextRank ? Math.max(0, Math.min(100, (((me as any).elo - (currentRank?.minElo ?? 0)) / denom) * 100)) : 100;
  const rankColor = getRankGradient((me as any)?.rank?.slug);

  return { stats, lectures, me, rankColor, currentRank, nextRank, toNext, progressPct } as const;
}

export default async function Dashboard() {
  const { stats, lectures, me, rankColor, currentRank, nextRank, toNext, progressPct } = await getData();
  const clientLectures: ClientLecture[] = lectures.map((l: any) => ({
    id: l.id,
    title: l.title,
    createdAtISO: new Date(l.createdAt).toISOString(),
    lastOpenedAtISO: l.lastOpenedAt ? new Date(l.lastOpenedAt).toISOString() : null,
    subtopicCount: l._count.subtopics,
    starred: l.starred ?? false,
  }));

  const continueLectures: ClientLecture[] = [...clientLectures]
    .sort((a, b) => {
      if (a.starred !== b.starred) return b.starred ? 1 : -1;
      const aOpen = a.lastOpenedAtISO ? Date.parse(a.lastOpenedAtISO) : 0;
      const bOpen = b.lastOpenedAtISO ? Date.parse(b.lastOpenedAtISO) : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      const aCreated = Date.parse(a.createdAtISO);
      const bCreated = Date.parse(b.createdAtISO);
      return bCreated - aCreated;
    })
    .slice(0, 5);

  const reviewLectureId = continueLectures[0]?.id || clientLectures[0]?.id || null;
  const profileUrl = me.username ? `/u/${me.username}` : `/u/id/${me.id}`;

  return (
    <div className="container-narrow space-y-12">
      {/* Profile header */}
      <section className="card relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full hero-spotlight" />
          <div className="absolute inset-0 opacity-[0.35] hero-grid" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        </div>
        <div className="p-5 pb-8 md:p-7 md:pb-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="relative top-[2px] self-start">
                <div className="relative h-24 w-24 rounded-full">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/50 via-emerald-400/30 to-emerald-300/20 blur-sm" />
                  <div className="relative h-full w-full overflow-hidden rounded-full bg-neutral-950 ring-2 ring-neutral-800">
                    {me.image ? (
                      <Image src={me.image} alt="avatar" width={96} height={96} className="h-full w-full object-cover" priority />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-500">
                        <UserIcon className="h-9 w-9" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{me.name || 'Your Dashboard'}</h1>
                  {me.username && (
                    <span className="rounded-full bg-neutral-900/70 px-2.5 py-0.5 text-xs text-neutral-300 ring-1 ring-neutral-800">@{me.username}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  Lifetime: {me.lifetimeLecturesCreated ?? stats.lifetime?.lecturesCreated ?? 0} lectures created •{' '}
                  {me.lifetimeSubtopicsMastered ?? stats.lifetime?.subtopicsMastered ?? me.masteredCount} subtopics mastered
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a href={profileUrl} className="text-xs text-neutral-300 underline decoration-neutral-700 underline-offset-4 hover:text-white">
                    View public profile
                  </a>
                  <span className="text-neutral-700">•</span>
                  <RankGuide label="Rank guide" initialElo={me.elo} />
                </div>
                {/* Mobile rank */}
                <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
                  <RankBadge
                    name={me.rank?.name || currentRank?.name || 'Unranked'}
                    slug={me.rank?.slug || currentRank?.slug || null}
                    iconUrl={me.rank?.iconUrl || null}
                    elo={me.elo}
                    rankColorClass={rankColor}
                  />
                </div>
              </div>
            </div>
            {/* Desktop right-side rank panel */}
            <div className="relative top-[4px] hidden shrink-0 items-center gap-6 md:flex">
              <div className="w-56">
                <RankProgressBar
                  progressPct={progressPct}
                  toNext={toNext}
                  currentLabel={currentRank ? currentRank.name : 'Unranked'}
                  nextLabel={nextRank ? nextRank.name : 'Max'}
                  gradientClass={rankColor}
                  min={currentRank?.minElo ?? 0}
                  max={nextRank?.minElo ?? me.elo}
                />
              </div>
              <div className="flex items-center gap-3">
                <RankBadge
                  name={me.rank?.name || currentRank?.name || 'Unranked'}
                  slug={me.rank?.slug || currentRank?.slug || null}
                  iconUrl={me.rank?.iconUrl || null}
                  elo={me.elo}
                  rankColorClass={rankColor}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard stats + CTA */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:col-span-2">
          <StatCard
            label="Lectures"
            value={stats.lectureCount ?? lectures.length}
            sub={`Lifetime ${stats.lifetime?.lecturesCreated ?? 0}`}
            icon={BookOpen}
            color="text-blue-400"
          />
          <StatCard
            label="Subtopics Mastered (Lifetime)"
            value={stats.lifetime?.subtopicsMastered ?? me.masteredCount ?? 0}
            icon={Target}
            color="text-green-400"
          />
          <StatCard
            label="Learning Elo"
            value={me.elo ?? 0}
            icon={BrainCircuit}
            color="text-purple-400"
          />
          <StatCard
            label="Current Streak"
            value={`${me.streak ?? 0} days`}
            icon={Flame}
            color="text-orange-400"
          />
        </div>
        <div className="card flex flex-col gap-4 p-6">
          <h3 className="text-xl font-semibold">Quick actions</h3>
          <p className="text-sm text-neutral-400">Jump back into learning or start something new.</p>
          <div className="grid grid-cols-1 gap-2">
            <Link href="/learn" className="btn-primary w-full px-6 py-3 font-semibold">
              New lecture
            </Link>
            {reviewLectureId && (
              <Link href={`/learn/${reviewLectureId}`} className="btn-ghost w-full">
                Continue last
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            )}
            <Link href="/leaderboard" className="btn-ghost w-full">View leaderboard</Link>
          </div>
        </div>
      </section>

      {/* Profile editor + continue learning */}
      <section className="grid gap-6 md:grid-cols-2">
        <ProfileClient initialUser={me as any} />
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Continue learning</h2>
            <Link href="/learn" className="text-sm text-neutral-300 hover:underline">Open workspace</Link>
          </div>
          {continueLectures.length === 0 ? (
            <p className="text-sm text-neutral-400">No lectures yet. Create one in the Learn Workspace.</p>
          ) : (
            <ul className="divide-y divide-neutral-900">
              {continueLectures.map((lec) => (
                <li key={lec.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {lec.starred && <Star className="h-3.5 w-3.5 text-yellow-400" />}
                      <Link href={`/learn/${lec.id}`} className="truncate font-medium hover:underline">
                        {lec.title}
                      </Link>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {lec.lastOpenedAtISO
                        ? `Opened ${formatTimeAgo(lec.lastOpenedAtISO)}`
                        : `Created ${formatTimeAgo(lec.createdAtISO)}`}
                      <span className="mx-2 opacity-50">•</span>
                      {lec.subtopicCount} subtopics
                    </div>
                  </div>
                  <div className="shrink-0">
                    <div className="inline-flex items-center gap-2">
                      <Link href={`/learn/${lec.id}`} className="btn-ghost px-3 py-1">Open</Link>
                      <Link href={`/revise/${lec.id}`} className="btn-ghost px-3 py-1">Revise</Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(me as any)?.isAdmin && (
          <div className="card p-6 md:col-span-2">
            <h2 className="mb-3 text-xl font-semibold">Admin Panel</h2>
            <p className="mb-4 text-sm text-neutral-400">You have admin access.</p>
            <div className="flex flex-wrap gap-3">
              <a href="/admin" className="btn-primary px-4 py-2">Open Admin Panel</a>
            </div>
          </div>
        )}
      </section>

      {/* Removed Learning Overview in favor of Continue learning above */}

      {/* Link to workspace instead of listing lectures here */}
      <section className="text-sm text-neutral-400">
        Manage all lectures in the <Link href="/learn" className="underline">Learn Workspace</Link>.
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
        <Image src={iconUrl} alt={name} width={72} height={72} className="relative top-[6px] h-[72px] w-[72px] object-contain" />
      ) : null}
      <div className={`relative top-[4px] bg-gradient-to-r ${rankColorClass} bg-clip-text text-sm font-semibold leading-tight text-transparent rank-shimmer`}>
        {name}
      </div>
      <div className="text-xs leading-tight text-neutral-400">Elo {elo}</div>
    </div>
  );
}

function RankProgressBar({
  progressPct,
  toNext,
  currentLabel,
  nextLabel,
  gradientClass,
  min,
  max,
}: {
  progressPct: number;
  toNext: number | null;
  currentLabel: string;
  nextLabel: string;
  gradientClass: string;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>{currentLabel}</span>
        <span className="text-neutral-500">{nextLabel}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-900">
        <div className={`h-full bg-gradient-to-r ${gradientClass}`} style={{ width: `${progressPct}%`, transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)' }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-neutral-500">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      {toNext != null && (
        <div className="text-[11px] text-neutral-400">{toNext} pts to next rank</div>
      )}
    </div>
  );
}

function AccuracyDonut({ value, gradientClass }: { value: number; gradientClass: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value || 0)));
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" className="shrink-0 overflow-visible">
      <circle cx="27" cy="27" r={r} stroke="rgb(38,38,38)" strokeWidth="6" fill="none" />
      <defs>
        <linearGradient id="acc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle
        cx="27"
        cy="27"
        r={r}
        stroke="url(#acc-grad)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={offset}
        transform="rotate(-90 27 27)"
      />
      <text x="27" y="30" textAnchor="middle" fontSize="11" fill="#e5e7eb" fontWeight="600">
        {clamped}%
      </text>
    </svg>
  );
}
