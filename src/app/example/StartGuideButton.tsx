'use client';

import { useState } from 'react';
import ExampleHelpAndTour from './ExampleHelpAndTour';

export default function StartGuideButton() {
  const [signal, setSignal] = useState(0);

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={() => setSignal((s) => s + 1)}
        className="rounded-md bg-[rgb(var(--accent))] px-3 py-1.5 text-xs font-semibold text-black hover:brightness-95"
      >
        Start Welcome Guide
      </button>
      {/* Hidden controller for the tour; reacts to signal */}
      <ExampleHelpAndTour hideButton externalStartSignal={signal} />
    </div>
  );
}


