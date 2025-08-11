import Link from 'next/link';
import LearnView from '@/components/LearnView';
import ExampleHelpAndTour from './ExampleHelpAndTour';
import { exampleLesson } from './generated';

// Public, read-only example lesson
export default function ExampleLessonPage() {
  const initial = exampleLesson as any;

  return (
    <div className="container-wide space-y-6">
      {/* Constrain header and demo banner to the same width as the content grid below (9/12 cols) */}
      <div className="grid grid-cols-1 gap-8 px-2 md:px-4 lg:grid-cols-12 lg:gap-10 xl:gap-12">
        <div className="lg:col-span-12">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">
              Example Lesson
            </h1>
            <div className="flex items-center gap-3">
              <ExampleHelpAndTour />
              <Link
                href="/"
                className="text-sm text-neutral-300 hover:text-white"
              >
                ← Back to Home
              </Link>
            </div>
          </div>
        </div>

        <div className="lg:col-span-12">
          <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300">
            <span>
              This is a public demo. Content and quizzes are preloaded. Your
              interactions are ephemeral and won’t be saved.
            </span>
            <Link
              href="/learn"
              className="btn-ghost border border-neutral-700 text-xs hover:border-neutral-500"
            >
              Create your own lecture
            </Link>
          </div>
        </div>
      </div>

      <LearnView initial={initial as any} demo />
    </div>
  );
}
