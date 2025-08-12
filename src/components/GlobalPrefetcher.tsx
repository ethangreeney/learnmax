'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

type GlobalPrefetcherProps = {
  routes?: string[];
};

const DEFAULT_ROUTES: string[] = [
  '/',
  '/dashboard',
  '/learn',
  '/leaderboard',
  '/profile',
];

export default function GlobalPrefetcher({ routes }: GlobalPrefetcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const routesToPrefetch = useMemo(() => {
    const unique = new Set((routes && routes.length ? routes : DEFAULT_ROUTES).filter(Boolean));
    if (pathname) unique.delete(pathname);
    return Array.from(unique);
  }, [pathname, routes]);

  useEffect(() => {
    if (routesToPrefetch.length === 0) return;

    const prefetchAll = () => {
      routesToPrefetch.forEach((href, index) => {
        const delayMs = 100 + index * 150;
        window.setTimeout(() => {
          // Best-effort; ignore errors if a route is not found or prefetch throws
          try {
            router.prefetch(href);
          } catch {
            // noop
          }
        }, delayMs);
      });
    };

    // Use idle time when available
    const ric: typeof window.requestIdleCallback | undefined = (window as any).requestIdleCallback;
    if (typeof ric === 'function') {
      ric(prefetchAll, { timeout: 2000 });
    } else {
      // Fallback after a short delay
      const id = window.setTimeout(prefetchAll, 250);
      return () => window.clearTimeout(id);
    }
  }, [routesToPrefetch, router]);

  return null;
}


