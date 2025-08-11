import { useEffect } from 'react';

/**
 * Locks body scrolling while preserving the current scroll position.
 * Uses the robust "position: fixed" pattern to avoid page jump-to-top
 * when modals/overlays open, and compensates for scrollbar width.
 */
export default function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body, documentElement: html } = document;

    // Save previous inline styles to restore precisely on cleanup
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
      overscrollBehavior: body.style.overscrollBehavior as string | undefined,
    };

    // Current scroll Y we want to preserve
    const scrollY = window.scrollY || window.pageYOffset || 0;

    // Compute scrollbar width to avoid layout shift when locking scroll
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    try {
      // Prefer fixing the body instead of toggling root overflow which can
      // cause browsers to jump to top. This preserves content position.
      html.style.overflow = 'hidden';

      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
      body.style.overscrollBehavior = 'none';
      // Avoid relying on body overflow; position:fixed is the main lock
      body.style.overflow = 'hidden';
    } catch {}

    return () => {
      // Restore styles exactly as they were
      try {
        html.style.overflow = prev.htmlOverflow;
        body.style.overflow = prev.bodyOverflow;
        body.style.position = prev.position;
        body.style.top = prev.top;
        body.style.left = prev.left;
        body.style.right = prev.right;
        body.style.width = prev.width;
        body.style.paddingRight = prev.paddingRight;
        if (prev.overscrollBehavior !== undefined) {
          body.style.overscrollBehavior = prev.overscrollBehavior;
        } else {
          body.style.removeProperty('overscroll-behavior');
        }

        // Restore the scroll position
        const y = Math.max(0, scrollY);
        window.scrollTo({
          top: y,
          left: 0,
          behavior: 'instant' as ScrollBehavior,
        });
      } catch {
        // Best-effort fallback if behavior:'instant' isn't supported
        try {
          window.scrollTo(0, Math.max(0, scrollY));
        } catch {}
      }
    };
  }, [active]);
}
