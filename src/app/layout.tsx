import type { Metadata } from 'next';
import ContentGate from '@/components/ContentGate';
import ClientBoundary from '@/components/ClientBoundary';
import AuthProvider from '@/components/AuthProvider';
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
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leaderboard', label: 'Leaderboard' },
  // Keep Learn as the rightmost link for prominence
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
          <header className="app-header py-6">
            <div className="container-narrow flex items-center justify-between">
              <Link
                href="/"
                className="text-xl font-semibold tracking-tight transition-opacity hover:opacity-90"
              >
                <span className="bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                  LearnMax
                </span>
              </Link>
              <nav className="flex items-center gap-4 text-sm text-neutral-300">
                {navLinks.map((link, index) => (
                  <Link
                    key={index}
                    href={link.href}
                    className="transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                <ClientBoundary />
              </div>
            </div>
          </header>
          <main className="py-10">{children}</main>
          <footer className="py-12 text-center text-sm text-neutral-500">
            Built with Next.js, Tailwind CSS, and Google Gemini.
          </footer>
        </AuthProvider>
        <ContentGate />
        {/* Prefetch common routes globally for snappier navigation */}
        <GlobalPrefetcher routes={[...navLinks.map((n) => n.href), '/profile']} />
      </body>
    </html>
  );
}
