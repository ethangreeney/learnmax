'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react'; // A popular icon library

// Helper component for displaying icons, you can keep this or replace it.
const IconWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700">
    {children}
  </div>
);

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 md:py-24">
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-neutral-200 to-neutral-500">
        Master Any Subject, Faster
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-neutral-400">
        LearnMax is your personal AI study companion. Paste lecture notes or upload PDFs, and let our AI break down complex topics into manageable steps, generate key insights, and quiz you until you achieve mastery.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/learn"
          className="inline-flex items-center gap-2 rounded-md bg-white px-6 py-3 text-black font-semibold shadow-md transition-transform hover:scale-105"
        >
          Start Learning Now
        </Link>
      </div>

      <div className="mt-24 w-full max-w-4xl">
        <h2 className="text-2xl font-semibold">How It Works</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          <div className="flex flex-col items-center gap-4">
            <IconWrapper>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </IconWrapper>
            <h3 className="font-semibold">1. Upload Content</h3>
            <p className="text-sm text-neutral-400">
              Paste text or upload a PDF of your lecture notes, articles, or study materials.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <IconWrapper>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>
            </IconWrapper>
            <h3 className="font-semibold">2. Get AI Insights</h3>
            <p className="text-sm text-neutral-400">
              Our AI analyzes the content, breaks it into logical subtopics, and provides a concise summary.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <IconWrapper>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12-2 2 4 4 6-6-2-2"></path><path d="M12 18V6"></path></svg>
            </IconWrapper>
            <h3 className="font-semibold">3. Master & Advance</h3>
            <p className="text-sm text-neutral-400">
              Tackle quizzes for each subtopic. You only unlock the next section when you've mastered the current one.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
