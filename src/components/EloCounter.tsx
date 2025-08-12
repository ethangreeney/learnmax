'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { rankFromElo, rankGradient, RANKS_FALLBACK } from '@/lib/client/rank-colors';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import useFocusTrap from '@/hooks/useFocusTrap';

/**
 * Persistent ELO counter for the navbar.
 * - Fetches current ELO on mount
 * - Listens for window events to animate increases
 *   - 'elo:delta' with detail: { delta: number }
 *   - 'elo:maybeRefresh' to refetch and animate if increased
 * - Respects prefers-reduced-motion and announces increases for screen readers
 */
type EloCounterProps = { initialElo?: number };

export default function EloCounter({ initialElo }: EloCounterProps) {
  const normalizedInitial = Number.isFinite(initialElo as number)
    ? Math.max(0, Math.round((initialElo as number) || 0))
    : 0;
  const [displayedElo, setDisplayedElo] = useState<number>(normalizedInitial);
  const [targetElo, setTargetElo] = useState<number>(normalizedInitial);
  const [glow, setGlow] = useState(false);
  const [srMsg, setSrMsg] = useState<string>('');
  const [rankSlug, setRankSlug] = useState<string | null>(null);
  const [rankName, setRankName] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [portalEl, setPortalEl] = useState<Element | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [ranks, setRanks] = useState<Array<{ slug: string; name: string; minElo: number; iconUrl?: string | null }>>(RANKS_FALLBACK);
  const [loadingRanks, setLoadingRanks] = useState(false);

  const animFrameRef = useRef<number | null>(null);
  const animStartRef = useRef<number>(0);
  const animFromRef = useRef<number>(0);
  const animToRef = useRef<number>(0);
  const prefersReducedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(false);

  const DURATION_MS = 700; // ~0.5–1s

  const isReducedMotion = (): boolean => {
    try {
      if (typeof window === 'undefined' || !window.matchMedia) return false;
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      return mq.matches;
    } catch {
      return false;
    }
  };

  const stopAnim = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

  const startAnimationTo = (nextTarget: number, announce: boolean) => {
    // Respect reduced motion: jump to value and announce
    prefersReducedRef.current = isReducedMotion();
    if (prefersReducedRef.current) {
      stopAnim();
      setDisplayedElo(nextTarget);
      setTargetElo(nextTarget);
      if (announce) setSrMsg(`ELO increased to ${nextTarget}`);
      // Subtle glow without motion
      setGlow(true);
      setTimeout(() => setGlow(false), 800);
      return;
    }

    const now = performance.now ? performance.now() : Date.now();
    const currentDisplayed = (() => {
      // If an animation is in progress, compute the instantaneous displayed value as base
      if (animFrameRef.current !== null) {
        const t0 = animStartRef.current;
        const from = animFromRef.current;
        const to = animToRef.current;
        const elapsed = Math.max(0, Math.min(DURATION_MS, now - t0));
        const p = easeOutCubic(elapsed / DURATION_MS);
        return Math.round(from + (to - from) * p);
      }
      return displayedElo;
    })();

    stopAnim();
    animStartRef.current = now;
    animFromRef.current = currentDisplayed;
    animToRef.current = nextTarget;
    setTargetElo(nextTarget);

    const step = () => {
      const t = performance.now ? performance.now() : Date.now();
      const elapsed = Math.max(0, Math.min(DURATION_MS, t - animStartRef.current));
      const p = easeOutCubic(elapsed / DURATION_MS);
      const value = Math.round(
        animFromRef.current + (animToRef.current - animFromRef.current) * p
      );
      setDisplayedElo(value);
      if (elapsed < DURATION_MS) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        stopAnim();
        setDisplayedElo(animToRef.current);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
    if (announce) setSrMsg(`ELO increased to ${nextTarget}`);
    setGlow(true);
    setTimeout(() => setGlow(false), 800);
  };

  const refreshIfIncreased = async () => {
    try {
      const res = await fetch('/api/users/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as any;
      const newElo = Number(data?.user?.elo ?? 0);
      const curr = animToRef.current || targetElo;
      if (Number.isFinite(newElo) && newElo > curr) {
        startAnimationTo(newElo, true);
      }
      if (data?.user?.rank) {
        setRankSlug(String(data.user.rank.slug || ''));
        setRankName(String(data.user.rank.name || ''));
      }
    } catch {}
  };

  useEffect(() => {
    setPortalEl(typeof document !== 'undefined' ? document.body : null);
    isMountedRef.current = true;
    // Seed animation refs from initial value to avoid a 0 → actual flicker on hydration
    animFromRef.current = normalizedInitial;
    animToRef.current = normalizedInitial;
    // Initial fetch
    (async () => {
      try {
        const res = await fetch('/api/users/me', { cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as any;
        const elo = Number(data?.user?.elo ?? 0);
        if (Number.isFinite(elo)) {
          setDisplayedElo(elo);
          setTargetElo(elo);
          animFromRef.current = elo;
          animToRef.current = elo;
        }
        if (data?.user?.rank) {
          setRankSlug(String(data.user.rank.slug || ''));
          setRankName(String(data.user.rank.name || ''));
        }
      } catch {}
    })();

    // Event subscriptions
    const onDelta = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const delta = Number(detail?.delta ?? 0);
      if (!Number.isFinite(delta) || delta <= 0) return;
      const next = (animToRef.current || targetElo) + Math.trunc(delta);
      startAnimationTo(next, true);
      // Optimistically update rank locally for immediate visual feedback
      const r = rankFromElo(next);
      setRankSlug(r.slug);
      setRankName(r.name);
    };
    const onMaybeRefresh = () => {
      void refreshIfIncreased();
    };
    window.addEventListener('elo:delta', onDelta as EventListener);
    window.addEventListener('elo:maybeRefresh', onMaybeRefresh as EventListener);

    // Track prefers-reduced-motion changes
    let mq: MediaQueryList | null = null;
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => {
          prefersReducedRef.current = mq!.matches;
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if ((mq as any).addListener) (mq as any).addListener(onChange);
      }
    } catch {}

    return () => {
      isMountedRef.current = false;
      stopAnim();
      window.removeEventListener('elo:delta', onDelta as EventListener);
      window.removeEventListener('elo:maybeRefresh', onMaybeRefresh as EventListener);
      try {
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener('change', () => {});
          else if ((mq as any).removeListener) (mq as any).removeListener(() => {});
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modal a11y helpers
  useBodyScrollLock(isOpen);
  useFocusTrap(modalRef, isOpen, { focusOnActivate: true });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen]);

  const ensureRanksLoaded = async () => {
    if (loadingRanks) return;
    setLoadingRanks(true);
    try {
      const res = await fetch('/api/ranks', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as any;
        const items = Array.isArray(data?.ranks) ? data.ranks : [];
        if (items.length) {
          items.sort((a: any, b: any) => (a?.minElo ?? 0) - (b?.minElo ?? 0));
          setRanks(
            items.map((r: any) => ({
              slug: String(r.slug || ''),
              name: String(r.name || r.slug || ''),
              minElo: Number(r.minElo || 0),
              iconUrl: r.iconUrl ?? null,
            }))
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingRanks(false);
    }
  };

  const openModal = () => {
    setIsOpen(true);
    void ensureRanksLoaded();
  };
  const closeModal = () => setIsOpen(false);

  const rank = rankSlug ? { slug: rankSlug, name: rankName || '' } : rankFromElo(targetElo || 0);
  const grad = rankGradient(rank.slug);

  return (
    <div className="relative" aria-live="polite" aria-atomic="true">
      <button
        type="button"
        onClick={openModal}
        onMouseEnter={() => void ensureRanksLoaded()}
        className={
          'group inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/70 px-2.5 py-1.5 text-sm text-neutral-200 transition-shadow ' +
          (glow ? 'shadow-[0_0_24px_rgba(34,197,94,0.35)] ring-1 ring-green-500/30' : '')
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="elo-ranks-dialog"
        aria-label={`ELO ${targetElo}`}
        title={`${rank.name}`}
      >
        <span className={`bg-gradient-to-r ${grad} bg-clip-text text-transparent rank-shimmer`}>ELO</span>
        <span className={`bg-gradient-to-r ${grad} bg-clip-text font-semibold tabular-nums text-transparent rank-shimmer`}>
          {displayedElo}
        </span>
        {glow && (
          <ArrowUpRight className="h-3.5 w-3.5 text-green-400" aria-hidden />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {srMsg}
      </span>

      {isOpen && portalEl &&
        createPortal(
          <div className="fixed inset-0 z-[100]">
            <div
              className="absolute inset-0 bg-black/75"
              onClick={closeModal}
              aria-hidden
            />
            <div className="absolute inset-0 grid place-items-center p-4">
              <div
                id="elo-ranks-dialog"
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label="ELO ranks and boundaries"
                className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-neutral-800/80 px-5 py-3.5">
                  <div className={`text-sm font-semibold bg-gradient-to-r ${grad} bg-clip-text text-transparent`}>Learning Ranks</div>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-md p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-3 py-3">
                  <ul className="divide-y divide-neutral-800/70">
                    {ranks.map((r, i) => {
                      const next = ranks[i + 1];
                      const min = r.minElo;
                      const max = next ? next.minElo - 1 : null;
                      const rangeLabel = max == null ? `${min}+` : `${min}\u2013${max}`;
                      const isCurrent = (targetElo ?? 0) >= min && (max == null || (targetElo ?? 0) <= max);
                      const gradClass = rankGradient(r.slug);
                      const denom = next ? Math.max(1, next.minElo - min) : 400;
                      const progressPct = isCurrent ? Math.max(0, Math.min(100, (((targetElo ?? 0) - min) / denom) * 100)) : 0;
                      const toNext = next ? Math.max(0, next.minElo - (targetElo ?? 0)) : null;
                      return (
                        <li key={`${r.slug}-${min}`} className={`relative rounded-md py-3 transition-colors ${isCurrent ? 'bg-neutral-900 ring-1 ring-green-500/20' : 'hover:bg-neutral-900'}`}>
                          <div className={`absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b ${gradClass} ${isCurrent ? 'opacity-80' : 'opacity-50'}`} />
                          <div className="flex min-w-0 items-center justify-between gap-3 pl-4 pr-3">
                            <div className="flex min-w-0 items-center gap-3">
                            {r.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-contain shadow-sm" />
                            ) : (
                              <div className={`h-9 w-9 shrink-0 rounded-md bg-gradient-to-br ${gradClass} shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]`} />
                            )}
                            <div className="min-w-0">
                               <div className={`bg-gradient-to-r ${gradClass} bg-clip-text text-[15px] font-semibold leading-tight text-transparent rank-shimmer`}>
                                {r.name}
                                {isCurrent && <span className="ml-2 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">Current</span>}
                              </div>
                               <div className="mt-0.5 inline-flex items-center gap-2 text-xs text-neutral-300">
                                 <span className="rounded-md border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-300">ELO {rangeLabel}</span>
                                 {isCurrent && toNext != null && toNext > 0 && (
                                   <span className="text-[10px] text-neutral-400">Next in <span className="font-medium text-neutral-200">{toNext}</span> pts</span>
                                 )}
                                 {isCurrent && toNext === 0 && (
                                   <span className="text-[10px] text-neutral-400">Rank up available</span>
                                 )}
                                 {isCurrent && toNext === null && (
                                   <span className="text-[10px] text-neutral-400">Top rank</span>
                                 )}
                               </div>
                            </div>
                            </div>
                            {isCurrent && (
                              <div className="ml-2 shrink-0 text-xs font-medium text-green-400">{targetElo} pts</div>
                            )}
                          </div>
                          {isCurrent && (
                            <div className="mt-2 px-4">
                              <div className="h-[6px] w-full overflow-hidden rounded-full bg-neutral-800">
                                <div className={`h-full bg-gradient-to-r ${gradClass}`} style={{ width: `${progressPct}%`, transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)' }} />
                              </div>
                              {next && (
                                <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-500">
                                  <span>{min}</span>
                                  <span>{next.minElo}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 text-[11px] text-neutral-500">
                    Boundaries indicate the minimum ELO required for each rank.
                  </div>
                </div>
              </div>
            </div>
          </div>,
          portalEl
        )}
    </div>
  );
}


