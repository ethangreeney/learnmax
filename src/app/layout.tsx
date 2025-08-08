import type { Metadata } from 'next';
import ContentGate from "@/components/ContentGate";
import ClientBoundary from '@/components/ClientBoundary';
import AuthProvider from '@/components/AuthProvider';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = {
  title: 'LearnMax — Your AI Study Companion',
  description: 'Master any subject by breaking complex lectures into focused steps, reviewing key insights, and advancing only when you master each concept.',
};
const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/learn', label: 'Learn' },
];
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <AuthProvider>
        <header className="py-8 border-b border-neutral-900">
          <div className="container-narrow flex items-center justify-between">
            <Link href="/" className="text-2xl font-semibold tracking-tight hover:text-white transition-colors">
              LearnMax
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-300">
              {navLinks.map((link, index) => (
                <Link key={index} href={link.href} className="hover:text-white transition-colors">
                  {link.label}
                </Link>
              ))}
            </nav>
            <ClientBoundary/>
          </div>
        </header>
        <main className="py-10">{children}</main>
        <footer className="py-12 text-center text-sm text-neutral-500">
          Built with Next.js, Tailwind CSS, and Google Gemini.
        </footer>
              </AuthProvider>
      <ContentGate />
    </body>
    </html>
  );
}
