// src/components/ContentGate.tsx
'use client';
import { useEffect } from 'react';

/**
 * The CSS hides .quiz-panel unless <body data-content="ready">.
 * On some navigations/subtopic changes that flag was lost, hiding the quiz.
 * We set it once on mount and never remove it.
 */
export default function ContentGate() {
  useEffect(() => {
    try {
      document.body.setAttribute('data-content', 'ready');
    } catch {}
  }, []);
  return null;
}
