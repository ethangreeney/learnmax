import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import LoginClient from './LoginClient';
import {
  ShieldCheck,
  BookOpen,
  Gauge,
  ChevronRight,
  Stars,
  Share2,
  UserPlus,
  Trophy,
  MessageSquare,
  Upload,
  UserCog,
} from 'lucide-react';

function sanitizeCallbackUrl(raw: string | string[] | undefined): string {
  const fallback = '/learn';
  const value = (Array.isArray(raw) ? raw[0] : raw || '').trim();
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.length > 2_048 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const base = 'https://learnmax.local';
    const parsed = new URL(value, base);
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (
      parsed.origin !== base ||
      decodedPath.startsWith('//') ||
      decodedPath.includes('\\') ||
      decodedPath === '/login' ||
      decodedPath.startsWith('/login/') ||
      decodedPath.startsWith('/api/auth')
    ) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function normalizeReason(raw: string | string[] | undefined): string {
  const v = (Array.isArray(raw) ? raw[0] : raw) || '';
  const allowed = new Set([
    'revise',
    'complete',
    'star',
    'share',
    'follow',
    'leaderboard',
    'chat',
    'import',
    'profile',
    'general',
  ]);
  return allowed.has(v) ? v : 'general';
}

function normalizeSrc(raw: string | string[] | undefined): string {
  const v = (Array.isArray(raw) ? raw[0] : raw) || '';
  const allowed = new Set([
    'ui_button',
    'inline_gate',
    'server_redirect',
    'link',
  ]);
  return allowed.has(v) ? v : 'server_redirect';
}

function reasonContent(reason: string): {
  title: string;
  subcopy: string;
  badge: string;
  icon: ReactNode;
} {
  const base = {
    subcopy: 'Keep your lessons, progress, and mastery synced to your account.',
  };
  switch (reason) {
    case 'revise':
      return {
        title: 'Sign in to continue revising',
        subcopy: base.subcopy,
        badge: 'Continue revision',
        icon: <Stars className="h-5 w-5" />,
      };
    case 'complete':
      return {
        title: 'Sign in to save your progress',
        subcopy: base.subcopy,
        badge: 'Save progress',
        icon: <ShieldCheck className="h-5 w-5" />,
      };
    case 'star':
      return {
        title: 'Sign in to save this lesson',
        subcopy: base.subcopy,
        badge: 'Save lesson',
        icon: <BookOpen className="h-5 w-5" />,
      };
    case 'share':
      return {
        title: 'Sign in to share this lesson',
        subcopy: base.subcopy,
        badge: 'Share lesson',
        icon: <Share2 className="h-5 w-5" />,
      };
    case 'follow':
      return {
        title: 'Sign in to follow this user',
        subcopy: base.subcopy,
        badge: 'Follow user',
        icon: <UserPlus className="h-5 w-5" />,
      };
    case 'leaderboard':
      return {
        title: 'Sign in to view the leaderboard',
        subcopy: base.subcopy,
        badge: 'View leaderboard',
        icon: <Trophy className="h-5 w-5" />,
      };
    case 'chat':
      return {
        title: 'Sign in to chat',
        subcopy: base.subcopy,
        badge: 'Open chat',
        icon: <MessageSquare className="h-5 w-5" />,
      };
    case 'import':
      return {
        title: 'Sign in to import files',
        subcopy: base.subcopy,
        badge: 'Import file',
        icon: <Upload className="h-5 w-5" />,
      };
    case 'profile':
      return {
        title: 'Sign in to edit your profile',
        subcopy: base.subcopy,
        badge: 'Edit profile',
        icon: <UserCog className="h-5 w-5" />,
      };
    default:
      return {
        title: 'Sign in to continue',
        subcopy: base.subcopy,
        badge: 'Continue',
        icon: <ShieldCheck className="h-5 w-5" />,
      };
  }
}

function signInErrorMessage(error: string) {
  switch (error) {
    case 'OAuthAccountNotLinked':
      return 'This email is linked to another sign-in method. Use the method you chose originally.';
    case 'AccessDenied':
      return 'Access was denied. Try again or choose another sign-in method.';
    case 'Configuration':
      return 'Sign-in is temporarily unavailable. Please try again later.';
    default:
      return 'We couldn’t sign you in. Please try again.';
  }
}

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to LearnMax to access your lessons and learning progress.',
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  const sp = (await searchParams) || {};
  const callbackUrl = sanitizeCallbackUrl(sp?.callbackUrl ?? sp?.next);
  const reason = normalizeReason(sp?.reason);
  const src = normalizeSrc(sp?.src);

  if (session?.user) {
    redirect(callbackUrl || '/learn');
  }

  const hasGoogle = Boolean(
    (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID) &&
      (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET)
  );
  const hasGitHub = Boolean(
    (process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID) &&
      (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET)
  );
  const hasApple = Boolean(
    (process.env.APPLE_CLIENT_ID || process.env.APPLE_ID) &&
      (process.env.APPLE_CLIENT_SECRET || process.env.APPLE_SECRET)
  );
  const error = Array.isArray(sp?.error) ? sp.error[0] : sp?.error || '';
  const hasProvider = hasGoogle || hasGitHub || hasApple;
  const rc = reasonContent(reason);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-spotlight absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full" />
        <div className="hero-grid absolute inset-0 opacity-[0.35]" />
      </div>
      <div className="container-narrow py-10 sm:py-14 lg:py-16">
        <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
          <section
            className="card relative overflow-hidden p-6 sm:p-8"
            aria-labelledby="sign-in-title"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              aria-hidden="true"
            >
              <div className="absolute -top-24 -right-24 h-60 w-60 rounded-full bg-emerald-500/30 blur-3xl" />
            </div>
            <div className="relative space-y-6">
              <header className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-md border border-emerald-800/40 bg-emerald-900/10 px-2.5 py-1 text-emerald-300">
                  <span className="text-emerald-300" aria-hidden="true">
                    {rc.icon}
                  </span>
                  <span className="text-xs">{rc.badge}</span>
                </div>
                <h1
                  id="sign-in-title"
                  className="text-3xl font-bold tracking-tight"
                >
                  {rc.title}
                </h1>
                <p className="max-w-lg text-sm leading-6 text-neutral-400">
                  {rc.subcopy}
                </p>
              </header>

              {error ? (
                <div
                  className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300"
                  role="alert"
                >
                  {signInErrorMessage(error)}
                </div>
              ) : null}

              <div className="space-y-3">
                <LoginClient
                  callbackUrl={callbackUrl}
                  hasGoogle={hasGoogle}
                  hasGitHub={hasGitHub}
                  hasApple={hasApple}
                  reason={reason}
                  src={src}
                  className="btn-xl w-full"
                />
                <Link href="/welcome" className="btn-ghost w-full px-5 py-3">
                  Back to LearnMax
                </Link>
              </div>

              {hasProvider && (
                <p className="text-xs leading-5 text-neutral-500">
                  Authentication happens with your chosen provider. LearnMax
                  never receives your password.
                </p>
              )}
            </div>
          </section>

          <aside
            className="card p-6 sm:p-8"
            aria-labelledby="sign-in-benefits-title"
          >
            <div className="mb-4 flex items-center gap-3">
              <div
                className="grid h-9 w-9 place-items-center rounded-md bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                aria-hidden="true"
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 id="sign-in-benefits-title" className="text-xl font-semibold">
                Keep your progress
              </h2>
            </div>
            <ul className="space-y-4 text-sm text-neutral-300">
              <li className="flex items-start gap-3">
                <div className="mt-0.5 text-neutral-500" aria-hidden="true">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Save your lessons</div>
                  <div className="mt-1 leading-5 text-neutral-400">
                    Pick up your lessons and revision sets on any device.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-0.5 text-neutral-500" aria-hidden="true">
                  <Gauge className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Track mastery</div>
                  <div className="mt-1 leading-5 text-neutral-400">
                    See progress across topics and know what to revise next.
                  </div>
                </div>
              </li>
            </ul>

            <Link
              href="/welcome"
              className="mt-6 inline-flex items-center text-sm font-medium text-neutral-300 hover:text-white"
            >
              See how LearnMax works
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
