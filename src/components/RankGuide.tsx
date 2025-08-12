'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import useFocusTrap from '@/hooks/useFocusTrap';
import { rankGradient, rankFromElo, RANKS_FALLBACK } from '@/lib/client/rank-colors';

type RankItem = { slug: string; name: string; minElo: number; iconUrl?: string | null };

export default function RankGuide({
  buttonClassName,
  label = 'Rank Guide',
}: {
  buttonClassName?: string;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [portalEl, setPortalEl] = useState<Element | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [ranks, setRanks] = useState<RankItem[]>(RANKS_FALLBACK);
  const [loadingRanks, setLoadingRanks] = useState(false);
  const [viewerElo, setViewerElo] = useState<number>(0);

  useEffect(() => {
    setPortalEl(typeof document !== 'undefined' ? document.body : null);
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

  // Keep the viewer's ELO fresh so the gradient color matches their current rank immediately
  const refreshIfIncreased = async () => {
    try {
      const res = await fetch('/api/users/me', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as any;
      const newElo = Number(data?.user?.elo ?? 0);
      if (Number.isFinite(newElo)) {
        setViewerElo((prev) => (newElo > (prev || 0) ? Math.max(0, newElo) : prev));
      }
    } catch {}
  };

  // Seed ELO on mount so the label gradient reflects the user's rank without needing to hover/open first
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users/me', { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as any;
          const elo = Number(data?.user?.elo ?? 0);
          if (Number.isFinite(elo)) setViewerElo(Math.max(0, elo));
        }
      } catch {}
    })();
  }, []);

  // Listen for global ELO events to update the gradient instantly when the user ranks up
  useEffect(() => {
    const onDelta = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const delta = Number(detail?.delta ?? 0);
      if (!Number.isFinite(delta)) return;
      setViewerElo((prev) => Math.max(0, Math.round((prev || 0) + Math.trunc(delta))));
    };
    const onMaybeRefresh = () => {
      void refreshIfIncreased();
    };
    try {
      window.addEventListener('elo:delta', onDelta as EventListener);
      window.addEventListener('elo:maybeRefresh', onMaybeRefresh as EventListener);
    } catch {}
    return () => {
      try {
        window.removeEventListener('elo:delta', onDelta as EventListener);
        window.removeEventListener('elo:maybeRefresh', onMaybeRefresh as EventListener);
      } catch {}
    };
  }, []);

  const ensureRanksLoaded = async () => {
    if (loadingRanks) return;
    setLoadingRanks(true);
    try {
      const [meRes, ranksRes] = await Promise.all([
        fetch('/api/users/me', { cache: 'no-store' }).catch(() => null),
        fetch('/api/ranks', { cache: 'no-store' }).catch(() => null),
      ]);
      if (meRes && meRes.ok) {
        const data = (await meRes.json().catch(() => ({}))) as any;
        const elo = Number(data?.user?.elo ?? 0);
        if (Number.isFinite(elo)) setViewerElo(Math.max(0, elo));
      }
      if (ranksRes && ranksRes.ok) {
        const data = (await ranksRes.json().catch(() => ({}))) as any;
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

  const open = () => {
    setIsOpen(true);
    void ensureRanksLoaded();
  };

  const currentRank = rankFromElo(viewerElo || 0);
  const grad = rankGradient(currentRank.slug);

  return (
    <div>
      <button
        type="button"
        onClick={open}
        onMouseEnter={() => void ensureRanksLoaded()}
        className={
          buttonClassName ||
          'inline-flex items-center gap-2 rounded-md bg-neutral-900/70 px-3 py-1.5 text-sm ring-1 ring-neutral-800 hover:bg-neutral-900'
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="rank-guide-dialog"
      >
        <span className={`bg-gradient-to-r ${grad} bg-clip-text font-semibold text-transparent rank-shimmer`}>
          {label}
        </span>
      </button>

      {isOpen && portalEl &&
        createPortal(
          <div className="fixed inset-0 z-[100]">
            <div className="absolute inset-0 bg-black/75" onClick={() => setIsOpen(false)} aria-hidden />
            <div className="absolute inset-0 grid place-items-center p-4">
              <div
                id="rank-guide-dialog"
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label="Learning ranks and boundaries"
                className="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 border-b border-neutral-800/80 px-5 py-3.5">
                  <div className={`text-sm font-semibold bg-gradient-to-r ${grad} bg-clip-text text-transparent`}>Learning Ranks</div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
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
                      const isCurrent = (viewerElo ?? 0) >= min && (max == null || (viewerElo ?? 0) <= max);
                      const gradClass = rankGradient(r.slug);
                      const denom = next ? Math.max(1, next.minElo - min) : 400;
                      const progressPct = isCurrent ? Math.max(0, Math.min(100, (((viewerElo ?? 0) - min) / denom) * 100)) : 0;
                      const toNext = next ? Math.max(0, next.minElo - (viewerElo ?? 0)) : null;
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
                              <div className="ml-2 shrink-0 text-xs font-medium text-green-400">{viewerElo} pts</div>
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


