import type { Metadata } from 'next';
import ContentGate from '@/components/ContentGate';
import ClientBoundary from '@/components/ClientBoundary';
import AuthProvider from '@/components/AuthProvider';
import NavigationLinks from '@/components/NavigationLinks';
import Link from 'next/link';
import './globals.css';
import 'katex/dist/katex.min.css';
import GlobalPrefetcher from '@/components/GlobalPrefetcher';
export const metadata: Metadata = {
  title: 'LearnMax — Your AI Study Companion',
  description:
    'Master any subject by breaking complex lectures into focused steps, reviewing key insights, and advancing only when you master each concept.',
};
const navLinks = [
  { href: '/welcome', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/learn', label: 'Learn' },
];
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <AuthProvider>
          <header className="app-header sticky top-0 z-40 border-b border-white/6 bg-neutral-950/85 py-3 backdrop-blur-xl">
            <div className="container-wide flex items-center justify-between gap-4">
              <Link
                href="/"
                className="shrink-0 text-xl font-semibold tracking-tight transition-opacity hover:opacity-90"
              >
                <span className="bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                  LearnMax
                </span>
              </Link>
              <NavigationLinks links={navLinks} />
              <div className="flex items-center gap-3">
                <ClientBoundary />
              </div>
            </div>
          </header>
          <main className="py-8">{children}</main>
        </AuthProvider>
        <ContentGate />
        {/* Prefetch common routes globally for snappier navigation */}
        <GlobalPrefetcher
          routes={[...navLinks.map((n) => n.href), '/profile']}
        />
      </body>
    </html>
  );
}
