// src/components/ContentGate.tsx
'use client';

import { useEffect } from 'react';

export default function ContentGate() {
  useEffect(() => {
    try { document.body.dataset.content = 'loading'; } catch {}

    const markQuizContainer = () => {
      const heads = Array.from(document.querySelectorAll('h2,h3'));
      const match = heads.find(h => /mastery\s+check/i.test(h.textContent || ''));
      const host = (match && (match.closest('section,div,article') || match.parentElement)) as HTMLElement | null;
      host?.classList.add('quiz-panel');
    };

    const updateStateFromLesson = () => {
      const el = document.querySelector('#lesson-markdown, [data-lesson="markdown"], .markdown, article.prose') as HTMLElement | null;
      const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const ok = text.length > 40 && !/crafting learning module/i.test(text);
      try { document.body.dataset.content = ok ? 'ready' : 'loading'; } catch {}
      return ok;
    };

    markQuizContainer(); updateStateFromLesson();

    const obs = new MutationObserver(() => { markQuizContainer(); updateStateFromLesson(); });
    try { obs.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch {}

    const t = setTimeout(() => {
      try { if (document.body.dataset.content !== 'ready') document.body.dataset.content = 'error'; } catch {}
      try { obs.disconnect(); } catch {}
    }, 35000);

    return () => { clearTimeout(t); try { obs.disconnect(); } catch {} };
  }, []);

  return null;
}
