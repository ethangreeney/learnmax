'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export default function JumpToMe({ meId }: { meId?: string | null }) {
  const target = useMemo(() => (meId ? `user-${meId}` : null), [meId]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target);
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
      setVisible(!inView);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [target]);

  const jump = useCallback(() => {
    if (!target) return;
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [target]);

  if (!meId) return null;
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={jump}
      className="rounded-full bg-neutral-900 px-3 py-1 text-sm text-neutral-200 ring-1 ring-neutral-800 hover:bg-neutral-800"
      aria-label="Jump to my position"
    >
      Jump to me
    </button>
  );
}


