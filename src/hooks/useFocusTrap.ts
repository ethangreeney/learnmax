import { useEffect } from 'react';

/**
 * Traps keyboard focus within a container while active.
 * - Cycles Tab/Shift+Tab between first/last focusable elements
 * - Optionally focuses the container on activation
 */
export default function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  active: boolean,
  options?: { focusOnActivate?: boolean }
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const getFocusable = () => {
      const nodes = container.querySelectorAll<HTMLElement>(
        [
          'a[href]',
          'area[href]',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          'button:not([disabled])',
          'iframe',
          'object',
          'embed',
          '[tabindex]:not([tabindex="-1"])',
          '[contenteditable="true"]',
        ].join(',')
      );
      return Array.from(nodes).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
    };

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (options?.focusOnActivate) {
      // Try focus the first focusable, fallback to container
      const focusables = getFocusable();
      const target = focusables[0] || container;
      try {
        target.focus({ preventScroll: true } as any);
      } catch {}
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = getFocusable();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (!current || current === first || !container.contains(current)) {
          e.preventDefault();
          try {
            last.focus();
          } catch {}
        }
      } else {
        if (!current || current === last || !container.contains(current)) {
          e.preventDefault();
          try {
            first.focus();
          } catch {}
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      // Attempt to restore focus to the previously focused element
      try {
        previouslyFocused?.focus();
      } catch {}
    };
  }, [containerRef, active, options?.focusOnActivate]);
}
