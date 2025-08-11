'use client';

import { useCallback, useMemo, useState } from 'react';
import WelcomeTour, { type TourStep } from '@/components/WelcomeTour';

export default function ExampleHelpAndTour() {
  const [openMenu, setOpenMenu] = useState(false);
  const [restartTick, setRestartTick] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const steps: TourStep[] = useMemo(
    () => [
      {
        id: 'welcome',
        title: 'Welcome to the Example Lesson',
        body:
          "This short tour will highlight key areas so you can start learning fast. You can move Next/Back, press ESC to close, or Skip anytime.",
        placement: 'bottom',
      },
      {
        id: 'navigate-outline',
        title: 'Navigate subtopics',
        body:
          'Use the outline to jump between subtopics. New items unlock as you progress.',
        selector: '[data-tour="outline"]',
        placement: 'right',
      },
      {
        id: 'content-pane',
        title: 'Lesson content',
        body:
          'Read concise explanations here. You can scroll and interact while the tour stays visible.',
        selector: '[data-tour="content-pane"]',
        placement: 'bottom',
      },
      {
        id: 'ai-explain',
        title: 'AI Tutor',
        body:
          'Ask the AI Tutor for clarifications or examples grounded in this lesson. It opens on the right.',
        selector: '[data-tour="chat-panel"]',
        placement: 'left',
      },
      {
        id: 'quiz',
        title: 'Practice with quizzes',
        body:
          'Answer quick questions to check understanding. Get two correct to move forward. You can generate another set.',
        selector: '[data-tour="quiz-panel"]',
        placement: 'top',
      },
      {
        id: 'revise',
        title: 'Revise and review',
        body:
          'Use the quiz and AI together to revisit tricky parts. More review tools are available on dedicated pages.',
        selector: '[data-tour="quiz-panel"]',
        placement: 'top',
      },
      {
        id: 'progress',
        title: 'Track progress',
        body:
          'Watch your progress grow as you master subtopics. Leaderboards are available from the main menu.',
        selector: '[data-tour="progress"]',
        placement: 'bottom',
      },
      {
        id: 'wrap',
        title: 'You’re ready!',
        body:
          'That’s it. You can restart this tour anytime from Help → “Restart Welcome Guide”. Have fun learning!',
        placement: 'bottom',
      },
    ],
    []
  );

  const storageKey = 'welcome-tour/example';

  const confirmRestart = useCallback(() => {
    setConfirming(true);
  }, []);
  const cancel = useCallback(() => setConfirming(false), []);
  const doRestart = useCallback(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ status: 'never', index: 0, updatedAt: Date.now() })
      );
    } catch {}
    setConfirming(false);
    setRestartTick((t) => t + 1);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <button
          onClick={() => setOpenMenu((o) => !o)}
          className="rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
          aria-haspopup="menu"
          aria-expanded={openMenu}
        >
          Help
        </button>
        {openMenu && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 min-w-[200px] rounded-md border border-neutral-700 bg-neutral-900 p-1 text-sm shadow-lg"
          >
            <button
              role="menuitem"
              onClick={confirmRestart}
              className="block w-full rounded-md px-3 py-2 text-left text-neutral-200 hover:bg-neutral-800"
            >
              Restart Welcome Guide
            </button>
          </div>
        )}
      </div>

      {confirming && (
        <div className="absolute right-0 z-50 mt-2 w-[260px] rounded-md border border-neutral-700 bg-neutral-900 p-3 text-sm shadow-xl">
          <div className="text-neutral-200">Restart the tour?</div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button onClick={cancel} className="rounded-md px-3 py-1 text-neutral-300 hover:bg-neutral-800">Cancel</button>
            <button onClick={doRestart} className="rounded-md bg-[rgb(var(--accent))] px-3 py-1 font-semibold text-black">Restart</button>
          </div>
        </div>
      )}

      <WelcomeTour
        steps={steps}
        storageKey={storageKey}
        autoShow={true}
        context={{ page: 'example', lessonId: 'example-lesson' }}
        restartSignal={restartTick}
      />
    </div>
  );
}


