import type { Metadata } from 'next';
import ContentGate from "@/components/ContentGate";
import ClientBoundary from '@/components/ClientBoundary';
import AuthProvider from '@/components/AuthProvider';
import ModelSelector from '@/components/ModelSelector';
import Link from 'next/link';
import './globals.css';
import 'katex/dist/katex.min.css';
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
        <header className="app-header py-6">
          <div className="container-narrow flex items-center justify-between">
            <Link href="/" className="text-xl font-semibold tracking-tight hover:opacity-90 transition-opacity">
              <span className="bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">LearnMax</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-300">
              {navLinks.map((link, index) => (
                <Link key={index} href={link.href} className="hover:text-white transition-colors">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <ModelSelector />
              <ClientBoundary/>
            </div>
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
