export default function LeaderboardLoading() {
  return (
    <div className="container-narrow space-y-6">
      <div className="sticky top-0 z-10 -mx-4 border-b border-neutral-900/80 bg-neutral-950/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="h-6 w-40 animate-pulse rounded bg-neutral-800" />
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-800 bg-neutral-950/80 p-4">
            <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-neutral-800 md:h-20 md:w-20" />
            <div className="mx-auto mt-3 h-3 w-24 animate-pulse rounded bg-neutral-800" />
            <div className="mx-auto mt-1 h-2 w-16 animate-pulse rounded bg-neutral-900" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-800">
        <ul className="divide-y divide-neutral-900">
          {Array.from({ length: 10 }).map((_, i) => (
            <li key={i} className="flex items-center gap-4 px-4 py-4 md:px-6">
              <div className="w-8 text-center text-neutral-600">{i + 1}</div>
              <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-800" />
              <div className="min-w-0 flex-1">
                <div className="h-3 w-40 animate-pulse rounded bg-neutral-800" />
                <div className="mt-2 h-2 w-32 animate-pulse rounded bg-neutral-900" />
              </div>
              <div className="h-6 w-28 animate-pulse rounded bg-neutral-800" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


