import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { ShieldCheck, BookOpen, Gauge, ChevronRight, Stars, Share2, UserPlus, Trophy, MessageSquare, Upload, UserCog } from 'lucide-react';

function sanitizeCallbackUrl(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : (raw || '');
  // Only allow same-origin relative paths
  try {
    // Disallow full URLs
    if (/^https?:\/\//i.test(value)) return '/learn';
    // Must start with '/'
    if (!value.startsWith('/')) return '/learn';
    // Prevent open redirects
    if (value.startsWith('\\')) return '/learn';
    // Basic sanity; keep query/hash as provided
    return value || '/learn';
  } catch {
    return '/learn';
  }
}

function normalizeReason(raw: string | string[] | undefined): string {
  const v = (Array.isArray(raw) ? raw[0] : raw) || '';
  const allowed = new Set(['revise','complete','star','share','follow','leaderboard','chat','import','profile','general']);
  return allowed.has(v) ? v : 'general';
}

function normalizeSrc(raw: string | string[] | undefined): string {
  const v = (Array.isArray(raw) ? raw[0] : raw) || '';
  const allowed = new Set(['ui_button','inline_gate','server_redirect','link']);
  return allowed.has(v) ? v : 'server_redirect';
}

function reasonContent(reason: string): { title: string; subcopy: string; badge: string; icon: React.ReactNode } {
  const base = {
    subcopy: 'Sign in to save progress, track mastery, and sync across devices.',
  };
  switch (reason) {
    case 'revise':
      return { title: 'Sign in to continue your revision', subcopy: base.subcopy, badge: 'Continue to Revise', icon: <Stars className="h-5 w-5" /> };
    case 'complete':
      return { title: 'Sign in to save your completion', subcopy: base.subcopy, badge: 'Continue to Complete', icon: <ShieldCheck className="h-5 w-5" /> };
    case 'star':
      return { title: 'Sign in to save this lesson', subcopy: base.subcopy, badge: 'Save lesson', icon: <BookOpen className="h-5 w-5" /> };
    case 'share':
      return { title: 'Sign in to share this lesson', subcopy: base.subcopy, badge: 'Share lesson', icon: <Share2 className="h-5 w-5" /> };
    case 'follow':
      return { title: 'Sign in to follow this user', subcopy: base.subcopy, badge: 'Follow user', icon: <UserPlus className="h-5 w-5" /> };
    case 'leaderboard':
      return { title: 'Sign in to view the leaderboard', subcopy: base.subcopy, badge: 'View leaderboard', icon: <Trophy className="h-5 w-5" /> };
    case 'chat':
      return { title: 'Sign in to chat', subcopy: base.subcopy, badge: 'Open chat', icon: <MessageSquare className="h-5 w-5" /> };
    case 'import':
      return { title: 'Sign in to import files', subcopy: base.subcopy, badge: 'Import file', icon: <Upload className="h-5 w-5" /> };
    case 'profile':
      return { title: 'Sign in to edit your profile', subcopy: base.subcopy, badge: 'Edit profile', icon: <UserCog className="h-5 w-5" /> };
    default:
      return { title: 'Sign in to continue', subcopy: base.subcopy, badge: 'Continue', icon: <ShieldCheck className="h-5 w-5" /> };
  }
}

export function generateMetadata({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = {} as Record<string, string | string[] | undefined>;
  const reason = normalizeReason(sp.reason);
  const robots = reason ? { index: false, follow: true, googleBot: { index: false, follow: true } } : undefined;
  return {
    title: 'Sign in',
    robots,
  } as any;
}

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getServerSession(authOptions);
  const sp = (await searchParams) || {};
  const callbackUrl = sanitizeCallbackUrl(sp?.callbackUrl ?? sp?.next);
  const reason = normalizeReason(sp?.reason);
  const src = normalizeSrc(sp?.src);

  if (session?.user) {
    redirect(callbackUrl || '/learn');
  }

  const hasGoogle = Boolean((process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ID) && (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SECRET));
  const hasGitHub = Boolean((process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID) && (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET));
  const hasApple = Boolean((process.env.APPLE_CLIENT_ID || process.env.APPLE_ID) && (process.env.APPLE_CLIENT_SECRET || process.env.APPLE_SECRET));
  const error = typeof sp?.error === 'string' ? sp.error : '';
  const rc = reasonContent(reason);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full hero-spotlight" />
        <div className="absolute inset-0 hero-grid opacity-[0.35]" />
      </div>
      <div className="container-narrow py-16">
        <div className="grid items-stretch gap-8 md:grid-cols-2">
          <div className="card relative overflow-hidden p-8">
            <div className="pointer-events-none absolute inset-0 opacity-[0.08]">
              <div className="absolute -right-24 -top-24 h-60 w-60 rounded-full bg-emerald-500/30 blur-3xl" />
            </div>
            <div className="space-y-6">
              <header className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-md border border-emerald-800/40 bg-emerald-900/10 px-2.5 py-1 text-emerald-300">
                  <div className="text-emerald-300">{rc.icon}</div>
                  <span className="text-xs">{rc.badge}</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{rc.title}</h1>
                <p className="text-sm text-neutral-400">{rc.subcopy}</p>
              </header>

              {error ? (
                <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
                  Sign-in failed, try again.
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <LoginClient
                  callbackUrl={callbackUrl}
                  hasGoogle={hasGoogle}
                  hasGitHub={hasGitHub}
                  hasApple={hasApple}
                  reason={reason}
                  src={src}
                  className="btn-xl"
                />
                <a href="/welcome" className="btn-ghost btn-xl">Back to Home</a>
              </div>

              {hasGoogle && (
                <p className="text-xs text-neutral-500">
                  Sign in with Google is secure. We never see your password; authentication happens with Google via OAuth 2.0.
                </p>
              )}

              {!hasGoogle && !hasGitHub && !hasApple && (
                <p className="text-xs text-neutral-500">
                  Sign-in providers are not configured for this environment. Please visit <a className="underline" href="/welcome">Home</a>.
                </p>
              )}
            </div>
          </div>

          <div className="card p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-semibold">Why sign in?</h2>
            </div>
            <ul className="space-y-4 text-sm text-neutral-300">
              <li className="flex items-start gap-3">
                <div className="mt-0.5 text-neutral-500">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Save and organize your lessons</div>
                  <div className="text-neutral-400">Your lectures, progress, and revisions are stored securely to pick up anytime.</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-0.5 text-neutral-500">
                  <Gauge className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium">Track mastery</div>
                  <div className="text-neutral-400">Earn Elo and see your improvement across topics over time.</div>
                </div>
              </li>
            </ul>

            <a href="/welcome" className="mt-6 inline-flex items-center text-sm text-neutral-300 hover:underline">
              Learn more about LearnMax
              <ChevronRight className="ml-1 h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}


