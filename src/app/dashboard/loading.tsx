export default function DashboardLoading() {
  return (
    <div className="container-narrow space-y-12">
      <section className="card relative overflow-hidden p-6">
        <div className="flex items-start gap-4">
          <div className="h-24 w-24 rounded-full bg-neutral-900" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-64 rounded bg-neutral-900" />
            <div className="h-4 w-80 rounded bg-neutral-900" />
            <div className="flex gap-2 pt-1">
              <div className="h-5 w-28 rounded bg-neutral-900" />
              <div className="h-5 w-24 rounded bg-neutral-900" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:col-span-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="h-5 w-24 rounded bg-neutral-900" />
              <div className="mt-4 h-10 w-20 rounded bg-neutral-800" />
              <div className="mt-2 h-4 w-32 rounded bg-neutral-900" />
            </div>
          ))}
        </div>
        <div className="card p-6">
          <div className="h-6 w-40 rounded bg-neutral-900" />
          <div className="mt-3 h-4 w-64 rounded bg-neutral-900" />
          <div className="mt-4 space-y-2">
            <div className="h-9 w-full rounded bg-neutral-900" />
            <div className="h-9 w-full rounded bg-neutral-900" />
            <div className="h-9 w-full rounded bg-neutral-900" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6 space-y-4">
          <div className="h-6 w-40 rounded bg-neutral-900" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="h-4 w-20 rounded bg-neutral-900" />
              <div className="h-10 w-full rounded bg-neutral-900" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 rounded bg-neutral-900" />
              <div className="h-10 w-full rounded bg-neutral-900" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <div className="h-4 w-12 rounded bg-neutral-900" />
              <div className="h-[88px] w-full rounded bg-neutral-900" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="h-9 w-40 rounded bg-neutral-900" />
            <div className="h-9 w-32 rounded bg-neutral-900" />
          </div>
        </div>
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-6 w-48 rounded bg-neutral-900" />
            <div className="h-4 w-32 rounded bg-neutral-900" />
          </div>
          <ul className="divide-y divide-neutral-900">
            {[...Array(5)].map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="h-4 w-56 rounded bg-neutral-900" />
                  <div className="h-3 w-40 rounded bg-neutral-900" />
                </div>
                <div className="inline-flex gap-2">
                  <div className="h-7 w-16 rounded bg-neutral-900" />
                  <div className="h-7 w-16 rounded bg-neutral-900" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}


