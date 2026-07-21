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
            <div className="app-header-inner container-wide flex items-center justify-between gap-4">
              <Link
                href="/"
                className="brand-link shrink-0"
                aria-label="LearnMax home"
              >
                <span className="brand-glyph" aria-hidden="true" />
                <span className="brand-wordmark">LearnMax</span>
              </Link>
              <NavigationLinks links={navLinks} />
              <div className="app-account flex items-center gap-2">
                <ClientBoundary />
              </div>
            </div>
          </header>
          <main className="app-main py-8">{children}</main>
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
