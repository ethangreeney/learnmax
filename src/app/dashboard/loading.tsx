function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={`dashboard-skeleton relative overflow-hidden rounded-md bg-neutral-800/75 ${className}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div
      className="container-narrow space-y-9"
      aria-busy="true"
      aria-label="Loading your dashboard"
    >
      <style>{`
        @keyframes dashboard-skeleton-sweep {
          from { transform: translateX(-120%); }
          to { transform: translateX(240%); }
        }
        .dashboard-skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          width: 45%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.055), transparent);
          animation: dashboard-skeleton-sweep 1.7s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .dashboard-skeleton::after { animation: none; }
        }
      `}</style>
      <section className="card relative overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent"
          aria-hidden="true"
        />
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center">
          <div>
            <Skeleton className="h-3 w-36" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-9 w-full max-w-lg" />
              <Skeleton className="h-9 w-4/5 max-w-md" />
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-3/4 max-w-md" />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Skeleton className="h-10 w-full sm:w-40" />
              <Skeleton className="h-10 w-full sm:w-32" />
              <Skeleton className="h-10 w-full sm:w-32" />
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/45 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-8" />
            </div>
            <div className="my-4 h-px bg-neutral-800/80" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
            <Skeleton className="mt-4 h-2 w-full rounded-full" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.8fr)]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 p-5 sm:p-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-52" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
          <div className="divide-y divide-neutral-800/70 px-5 sm:px-6">
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5 min-w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <div className="flex shrink-0 gap-2">
                  <Skeleton className="h-8 flex-1 sm:w-16" />
                  <Skeleton className="h-8 flex-1 sm:w-16" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-44" />
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-neutral-800/80 bg-neutral-950/45 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-7 w-16" />
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
                <Skeleton className="mt-3 h-3 w-full" />
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-neutral-800/80 bg-neutral-950/45 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-4 w-36" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-4 h-4 w-28" />
          </div>
        </aside>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="card space-y-6 p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </section>
    </div>
  );
}
