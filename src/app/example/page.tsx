import Link from 'next/link';
import LearnView from '@/components/LearnView';
import { exampleLesson } from './generated';
import ScrollPastHeader from './ScrollPastHeader';
import StartGuideButton from './StartGuideButton';

// Public, read-only example lesson
export default function ExampleLessonPage() {
  const initial = exampleLesson as any;

  return (
    <div className="container-wide space-y-6">
      {/* Ensure initial load hides the global nav while keeping page header/banner visible */}
      <ScrollPastHeader />
      {/* Constrain header and demo banner to the same width as the content grid below (9/12 cols) */}
      <div className="grid grid-cols-1 gap-8 px-2 md:px-4 lg:grid-cols-12 lg:gap-10 xl:gap-12">

        <div className="lg:col-span-12">
          <div className="flex flex-col gap-3 rounded-md border border-neutral-800 bg-neutral-900/40 p-4 text-sm text-neutral-300 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <span>
                This is a public demo. Content and quizzes are preloaded. Your
                interactions are ephemeral and won’t be saved.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <StartGuideButton />
              <Link
                href="/learn"
                className="btn-ghost border border-neutral-700 text-xs hover:border-neutral-500"
              >
                Create your own lecture
              </Link>
            </div>
          </div>
        </div>
      </div>

      <LearnView initial={initial as any} demo />
    </div>
  );
}
