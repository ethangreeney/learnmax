'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Row = {
  userId: string;
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  lastActivity: string | null;
};

type ApiResponse = {
  page: number;
  perPage: number;
  totalUsers: number;
  totalPages: number;
  sort: string;
  order: 'asc' | 'desc';
  filters: {
    q: string;
    model: string | null;
    route: string | null;
    from: string | null;
    to: string | null;
  };
  summary: {
    requests: number;
    tokensInput: number;
    tokensOutput: number;
    totalTokens: number;
  };
  rows: Row[];
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString();
}

function useQueryState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = React.useCallback((key: string, fallback?: string) => {
    const v = sp?.get(key);
    return (v === null || v === undefined || v === '') && fallback !== undefined ? fallback : (v ?? undefined);
  }, [sp]);

  const setMany = React.useCallback((kv: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp?.toString());
    Object.entries(kv).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') next.delete(k);
      else next.set(k, v);
    });
    router.replace(`${pathname}?${next.toString()}`);
  }, [router, pathname, sp]);

  return { get, setMany };
}

export default function TokensClient() {
  const { get, setMany } = useQueryState();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ApiResponse | null>(null);

  const page = parseInt(get('page', '1')!, 10) || 1;
  const perPage = parseInt(get('perPage', '50')!, 10) || 50;
  const sort = get('sort', 'total')!;
  const order = (get('order', 'desc')! as 'asc' | 'desc');
  const range = get('range', '30d')!;
  const q = get('q', '') || '';
  const model = get('model', '') || '';
  const route = get('route', '') || '';
  const from = get('from', '') || '';
  const to = get('to', '') || '';

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', String(perPage));
      params.set('sort', sort);
      params.set('order', order);
      if (range) params.set('range', range);
      if (q) params.set('q', q);
      if (model) params.set('model', model);
      if (route) params.set('route', route);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/admin/tokens?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, sort, order, range, q, model, route, from, to]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  function updateSort(nextKey: string) {
    const nextOrder = sort === nextKey ? (order === 'asc' ? 'desc' : 'asc') : (nextKey === 'total' ? 'desc' : 'asc');
    setMany({ sort: nextKey, order: nextOrder, page: '1' });
  }

  const csvHref = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set('sort', sort);
    p.set('order', order);
    if (range) p.set('range', range);
    if (q) p.set('q', q);
    if (model) p.set('model', model);
    if (route) p.set('route', route);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('format', 'csv');
    return `/api/admin/tokens?${p.toString()}`;
  }, [sort, order, range, q, model, route, from, to]);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Requests</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(data?.summary.requests || 0)}</div>
        </div>
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Input</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(data?.summary.tokensInput || 0)}</div>
        </div>
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Output</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(data?.summary.tokensOutput || 0)}</div>
        </div>
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Total</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(data?.summary.totalTokens || 0)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-x-5 gap-y-4">
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400">Range</label>
            <select
              value={range}
              onChange={(e) => setMany({ range: e.target.value, from: undefined, to: undefined, page: '1' })}
              className="select"
            >
              <option value="24h">24h</option>
              <option value="7d">7d</option>
              <option value="30d">30d</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400">From</label>
            <input type="datetime-local" value={from} onChange={(e) => setMany({ from: e.target.value, range: undefined, page: '1' })} className="input h-10" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400">To</label>
            <input type="datetime-local" value={to} onChange={(e) => setMany({ to: e.target.value, range: undefined, page: '1' })} className="input h-10" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400">Model</label>
            <input type="text" value={model} onChange={(e) => setMany({ model: e.target.value || undefined, page: '1' })} className="input h-10" placeholder="model id" />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400">Route</label>
            <input type="text" value={route} onChange={(e) => setMany({ route: e.target.value || undefined, page: '1' })} className="input h-10" placeholder="/api/..." />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-neutral-400">Per page</label>
            <select value={String(perPage)} onChange={(e) => setMany({ perPage: e.target.value, page: '1' })} className="select">
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <label className="text-xs text-neutral-400">Search (username/email)</label>
            <input type="text" value={q} onChange={(e) => setMany({ q: e.target.value || undefined, page: '1' })} className="input h-10" placeholder="search..." />
          </div>

          <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-1 xl:col-span-2 min-w-[220px]">
            <button
              className="btn-ghost h-10 whitespace-nowrap px-4"
              onClick={() => setMany({ range: '30d', from: undefined, to: undefined, model: undefined, route: undefined, q: undefined, page: '1' })}
            >
              Reset
            </button>
            <a href={csvHref} target="_blank" rel="noreferrer" className="btn-ghost h-10 whitespace-nowrap px-4">Export CSV</a>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950/40">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-400">
              <th className="px-4 py-3 cursor-pointer" onClick={() => updateSort('user')}>User {sort === 'user' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
              <th className="px-4 py-3 cursor-pointer text-right tabular-nums" onClick={() => updateSort('requests')}>Requests {sort === 'requests' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
              <th className="px-4 py-3 cursor-pointer text-right tabular-nums" onClick={() => updateSort('input')}>Input {sort === 'input' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
              <th className="px-4 py-3 cursor-pointer text-right tabular-nums" onClick={() => updateSort('output')}>Output {sort === 'output' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
              <th className="px-4 py-3 cursor-pointer text-right tabular-nums" onClick={() => updateSort('total')}>Total {sort === 'total' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
              <th className="px-4 py-3 cursor-pointer" onClick={() => updateSort('last')}>Last activity {sort === 'last' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-4 py-4" colSpan={6}>Loading...</td></tr>
            )}
            {error && !loading && (
              <tr><td className="px-4 py-4 text-red-500" colSpan={6}>{error}</td></tr>
            )}
            {!loading && !error && data?.rows?.length === 0 && (
              <tr><td className="px-4 py-4" colSpan={6}>No results</td></tr>
            )}
            {data?.rows?.map((r) => (
              <tr key={r.userId} className="border-t border-neutral-900">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {r.image ? <img src={r.image} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-neutral-800" />}
                    <div>
                      <div className="font-medium">{r.name || r.username || r.email || r.userId.slice(0, 8)}</div>
                      <div className="text-xs text-neutral-400">{r.username ? `@${r.username}` : (r.email || '')}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.requests)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.tokensInput)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.tokensOutput)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatNumber(r.totalTokens)}</td>
                <td className="px-4 py-3">{formatDate(r.lastActivity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-neutral-400">
          Page {data ? data.page : page} of {data ? data.totalPages : '-'} · {data ? formatNumber(data.totalUsers) : '-'} users
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" disabled={page <= 1 || loading} onClick={() => setMany({ page: String(Math.max(1, page - 1)) })}>Prev</button>
          <button className="btn-ghost" disabled={!!data && (data.page >= data.totalPages) || loading} onClick={() => setMany({ page: String(page + 1) })}>Next</button>
        </div>
      </div>
    </div>
  );
}


