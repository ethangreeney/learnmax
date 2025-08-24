'use client';

import { useEffect } from 'react';

export default function ScrollPastHeader() {
  useEffect(() => {
    try {
      const prev = document.body.getAttribute('data-page');
      document.body.setAttribute('data-page', 'demo-example');
      const header = document.querySelector('header.app-header') as HTMLElement | null;
      const height = header ? header.offsetHeight : 0;
      if (height > 0) {
        // Scroll so the global nav is just out of view but the page's own top is visible
        window.scrollTo({ top: height, behavior: 'auto' });
      }
      return () => {
        if (prev) document.body.setAttribute('data-page', prev);
        else document.body.removeAttribute('data-page');
      };
    } catch {}
  }, []);
  return null;
}


