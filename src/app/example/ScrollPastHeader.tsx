'use client';

import { useEffect } from 'react';

export default function ScrollPastHeader() {
  useEffect(() => {
    try {
      const header = document.querySelector('header.app-header') as HTMLElement | null;
      const height = header ? header.offsetHeight : 0;
      if (height > 0) {
        // Scroll so the global nav is just out of view but the page's own top is visible
        window.scrollTo({ top: height, behavior: 'auto' });
      }
    } catch {}
  }, []);
  return null;
}


