import Image from 'next/image';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Flame,
  Plus,
  RotateCcw,
  Star,
  Target,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import { authOptions } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';
import type { ClientLecture } from '@/components/LectureList';
import {
  getLecturesCached,
  getProfileForUser,
  getUserStatsCached,
} from '@/lib/cached';
import { getRankGradient, getRanksSafe } from '@/lib/ranks';
import ProfileClient from '@/app/profile/ProfileClient';
import ProfileAvatar from '@/components/ProfileAvatar';
import RankGuide from '@/components/RankGuide';

function StatCard({
  icon: Icon,
  label,
  value,
  context,
  iconClass,
  iconBackground,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  context: string;
  iconClass: string;
  iconBackground: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/45 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.14em] text-neutral-500 uppercase">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2 ${iconBackground}`} aria-hidden="true">
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-500">{context}</p>
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';

  const diff = Math.max(0, Date.now() - then);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) {
    const minutes = Math.max(1, Math.floor(diff / minute));
    return `${minutes} min ago`;
  }
  if (diff < day) {
    const hours = Math.max(1, Math.floor(diff / hour));
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.floor(diff / day));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

async function getData() {
  const session = await getServerSession(authOptions);
  if (!isSessionWithUser(session)) {
    redirect('/login?callbackUrl=/dashboard');
  }

  const userId = session.user.id;
  const email = (session.user as any)?.email || null;
  const providerImage = (session.user as any)?.image || null;
  const [stats, lectures, ranks] = await Promise.all([
    getUserStatsCached(userId),
    getLecturesCached(userId, { take: 15 }),
    getRanksSafe(),
  ]);
  const me = await getProfileForUser(userId, {
    email,
    providerImage,
    stats,
    ranks,
    includeQuiz: false,
  });

  const sortedRanks = [...ranks].sort((a, b) => a.minElo - b.minElo);
  let currentIndex = 0;
  for (let index = 0; index < sortedRanks.length; index += 1) {
    if ((me as any).elo >= sortedRanks[index].minElo) currentIndex = index;
    else break;
  }

  const currentRank = sortedRanks[currentIndex] ?? null;
  const nextRank = sortedRanks[currentIndex + 1] ?? null;
  const pointsToNext = nextRank
    ? Math.max(0, nextRank.minElo - (me as any).elo)
    : null;
  const rankRange = nextRank
    ? Math.max(1, nextRank.minElo - (currentRank?.minElo ?? 0))
    : 1;
  const progressPct = nextRank
    ? Math.max(
        0,
        Math.min(
          100,
          (((me as any).elo - (currentRank?.minElo ?? 0)) / rankRange) * 100
        )
      )
    : 100;
  const rankColor = getRankGradient((me as any)?.rank?.slug);

  return {
    stats,
    lectures,
    me,
    rankColor,
    currentRank,
    nextRank,
    pointsToNext,
    progressPct,
  } as const;
}

export default async function Dashboard() {
  const {
    stats,
    lectures,
    me,
    rankColor,
    currentRank,
    nextRank,
    pointsToNext,
    progressPct,
  } = await getData();
  const clientLectures: ClientLecture[] = lectures.map((lecture: any) => ({
    id: lecture.id,
    title: lecture.title,
    createdAtISO: new Date(lecture.createdAt).toISOString(),
    lastOpenedAtISO: lecture.lastOpenedAt
      ? new Date(lecture.lastOpenedAt).toISOString()
      : null,
    subtopicCount: lecture._count.subtopics,
    starred: lecture.starred ?? false,
  }));

  const recentLectures = [...clientLectures]
    .sort((a, b) => {
      const aActivity = Date.parse(a.lastOpenedAtISO || a.createdAtISO);
      const bActivity = Date.parse(b.lastOpenedAtISO || b.createdAtISO);
      return bActivity - aActivity;
    })
    .slice(0, 5);
  const nextLecture = recentLectures[0] ?? null;
  const profileUrl = me.username ? `/u/${me.username}` : `/u/id/${me.id}`;
  const firstName = me.name?.trim().split(/\s+/)[0] || 'there';
  const currentLectureCount = stats.lectureCount ?? lectures.length;
  const lifetimeLectureCount =
    stats.lifetime?.lecturesCreated ?? currentLectureCount;
  const lifetimeMasteredCount =
    stats.lifetime?.subtopicsMastered ?? me.masteredCount ?? 0;
  const streak = me.streak ?? 0;

  return (
    <div className="container-narrow space-y-8">
      <section
        className="card relative overflow-hidden"
        aria-labelledby="dashboard-title"
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <div className="hero-spotlight absolute -top-28 -left-24 h-72 w-72 rounded-full opacity-80" />
          <div className="hero-grid absolute inset-0 opacity-30" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
        </div>

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              Welcome back, {firstName}
            </p>
            <h1
              id="dashboard-title"
              className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl"
            >
              {nextLecture
                ? 'Ready for your next study session?'
                : 'Build your first focused lesson'}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400 sm:text-base">
              {nextLecture
                ? `Pick up “${nextLecture.title}” where you left off, or turn new material into a focused lesson.`
                : 'Paste your notes, choose the right level of detail, and let LearnMax guide you through one concept at a time.'}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href={nextLecture ? `/learn/${nextLecture.id}` : '/learn'}
                className="btn-primary px-5 py-2.5 font-semibold"
              >
                {nextLecture ? 'Continue learning' : 'Create your first lesson'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {nextLecture ? (
                <>
                  <Link href="/learn" className="btn-ghost px-5 py-2.5">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New lesson
                  </Link>
                  <Link
                    href={`/revise/${nextLecture.id}`}
                    className="btn-ghost px-5 py-2.5"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Quick review
                  </Link>
                </>
              ) : (
                <Link href="/example" className="btn-ghost px-5 py-2.5">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Explore the demo
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/55 p-5 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-neutral-900 ring-1 ring-neutral-700">
                {me.image ? (
                  <ProfileAvatar
                    userId={me.id}
                    src={String(me.image)}
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-neutral-500">
                    <UserIcon className="h-6 w-6" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">
                  {me.name || 'Your profile'}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {me.username ? `@${me.username}` : 'Add a username below'}
                </p>
              </div>
              <Link
                href={profileUrl}
                className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-neutral-800/70 hover:text-white"
                aria-label="View public profile"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="my-4 h-px bg-neutral-800/80" />
            <div className="flex items-center justify-between gap-3">
              <RankBadge
                name={me.rank?.name || currentRank?.name || 'Unranked'}
                iconUrl={me.rank?.iconUrl || null}
                elo={me.elo}
                rankColorClass={rankColor}
              />
              <RankGuide
                label="Rank guide"
                initialElo={me.elo}
                buttonClassName="rounded-md px-2.5 py-1.5 text-xs text-neutral-400 ring-1 ring-neutral-800 transition-colors hover:bg-neutral-900 hover:text-white"
              />
            </div>
            <div className="mt-4">
              <RankProgressBar
                progressPct={progressPct}
                pointsToNext={pointsToNext}
                currentLabel={currentRank?.name || 'Unranked'}
                nextLabel={nextRank?.name || 'Top rank'}
                gradientClass={rankColor}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.8fr)]">
        <section
          className="card overflow-hidden"
          aria-labelledby="continue-learning-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-neutral-800/80 p-5 sm:items-center sm:p-6">
            <div>
              <h2
                id="continue-learning-title"
                className="text-xl font-semibold tracking-tight text-white"
              >
                Continue learning
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Your most recently active lessons.
              </p>
            </div>
            {recentLectures.length > 0 && (
              <Link
                href="/learn"
                className="shrink-0 text-sm font-medium text-neutral-300 hover:text-white"
              >
                View all
              </Link>
            )}
          </div>

          {recentLectures.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 p-3 text-emerald-400">
                <BookOpen className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-semibold text-white">
                Start with material you already have
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
                Paste notes or upload a PDF. LearnMax will turn it into a
                structured lesson with explanations and practice.
              </p>
              <Link href="/learn" className="btn-primary mt-5 px-5 py-2.5">
                Create a lesson
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-800/70 px-5 sm:px-6">
              {recentLectures.map((lecture) => {
                const activityISO =
                  lecture.lastOpenedAtISO || lecture.createdAtISO;
                const activityPrefix = lecture.lastOpenedAtISO
                  ? 'Opened'
                  : 'Created';
                return (
                  <li
                    key={lecture.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {lecture.starred && (
                          <span
                            title="Starred lesson"
                            className="shrink-0 text-amber-400"
                          >
                            <Star
                              className="h-3.5 w-3.5 fill-current"
                              aria-hidden="true"
                            />
                            <span className="sr-only">Starred</span>
                          </span>
                        )}
                        <Link
                          href={`/learn/${lecture.id}`}
                          className="truncate font-medium text-neutral-100 transition-colors hover:text-emerald-300"
                        >
                          {lecture.title}
                        </Link>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        <time dateTime={activityISO}>
                          {activityPrefix} {formatTimeAgo(activityISO)}
                        </time>
                        <span
                          className="mx-2 text-neutral-700"
                          aria-hidden="true"
                        >
                          ·
                        </span>
                        {pluralize(lecture.subtopicCount, 'subtopic')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link
                        href={`/learn/${lecture.id}`}
                        className="btn-ghost flex-1 px-3 py-1.5 sm:flex-none"
                        aria-label={`Open ${lecture.title}`}
                      >
                        Open
                      </Link>
                      <Link
                        href={`/revise/${lecture.id}`}
                        className="btn-ghost flex-1 px-3 py-1.5 sm:flex-none"
                        aria-label={`Revise ${lecture.title}`}
                      >
                        Revise
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card p-5 sm:p-6" aria-labelledby="progress-title">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2
                id="progress-title"
                className="text-xl font-semibold tracking-tight text-white"
              >
                Your progress
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                A quick view of your momentum.
              </p>
            </div>
            <Trophy className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatCard
              label="Lessons"
              value={currentLectureCount}
              context={`${lifetimeLectureCount} created all time`}
              icon={BookOpen}
              iconClass="text-sky-300"
              iconBackground="bg-sky-500/10"
            />
            <StatCard
              label="Mastered"
              value={lifetimeMasteredCount}
              context="Subtopics completed"
              icon={Target}
              iconClass="text-emerald-300"
              iconBackground="bg-emerald-500/10"
            />
            <StatCard
              label="Streak"
              value={pluralize(streak, 'day')}
              context="Consecutive study days"
              icon={Flame}
              iconClass="text-orange-300"
              iconBackground="bg-orange-500/10"
            />
            <StatCard
              label="Elo"
              value={me.elo ?? 0}
              context={currentRank?.name || 'Learning rank'}
              icon={BrainCircuit}
              iconClass="text-violet-300"
              iconBackground="bg-violet-500/10"
            />
          </div>

          <div className="mt-5 rounded-xl border border-neutral-800/80 bg-neutral-950/45 p-4">
            <p className="text-xs font-medium tracking-[0.14em] text-neutral-500 uppercase">
              Next milestone
            </p>
            <p className="mt-2 font-medium text-neutral-100">
              {nextRank && pointsToNext != null
                ? `${pluralize(pointsToNext, 'point')} to ${nextRank.name}`
                : 'You reached the highest rank'}
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              Practice and master lesson subtopics to keep progressing.
            </p>
            <Link
              href="/leaderboard"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300"
            >
              View leaderboard
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>

      <section className="space-y-4" aria-labelledby="profile-settings-title">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2
              id="profile-settings-title"
              className="text-xl font-semibold tracking-tight text-white"
            >
              Profile details
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Keep your public learning profile recognizable and up to date.
            </p>
          </div>
          <Link
            href={profileUrl}
            className="text-sm font-medium text-neutral-300 hover:text-white"
          >
            View public profile
          </Link>
        </div>
        <ProfileClient initialUser={me as any} />
      </section>

      {(me as any)?.isAdmin && (
        <section
          className="card flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center"
          aria-labelledby="admin-title"
        >
          <div>
            <h2 id="admin-title" className="text-lg font-semibold text-white">
              Administration
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Manage ranks, tokens, and platform settings.
            </p>
          </div>
          <Link href="/admin" className="btn-ghost shrink-0 px-4 py-2">
            Open admin panel
          </Link>
        </section>
      )}
    </div>
  );
}

function RankBadge({
  name,
  iconUrl,
  elo,
  rankColorClass,
}: {
  name: string;
  iconUrl: string | null | undefined;
  elo: number;
  rankColorClass: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {iconUrl ? (
        <Image
          src={iconUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
        />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <Trophy className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
      <div className="min-w-0">
        <p
          className={`truncate bg-gradient-to-r ${rankColorClass} bg-clip-text text-sm font-semibold text-transparent`}
        >
          {name}
        </p>
        <p className="text-xs text-neutral-500">{elo} Elo</p>
      </div>
    </div>
  );
}

function RankProgressBar({
  progressPct,
  pointsToNext,
  currentLabel,
  nextLabel,
  gradientClass,
}: {
  progressPct: number;
  pointsToNext: number | null;
  currentLabel: string;
  nextLabel: string;
  gradientClass: string;
}) {
  const roundedProgress = Math.round(progressPct);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-neutral-500">
        <span>{currentLabel}</span>
        <span>{nextLabel}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
        role="progressbar"
        aria-label={`Progress from ${currentLabel} to ${nextLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={roundedProgress}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradientClass}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {pointsToNext == null
          ? 'Highest rank reached'
          : `${pluralize(pointsToNext, 'point')} to the next rank`}
      </p>
    </div>
  );
}
