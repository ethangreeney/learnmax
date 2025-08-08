import Link from "next/link";

export default function CompletePage() {
  return (
    <div className="min-h-[calc(100vh-64px)] w-full flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl border border-green-500/30 bg-green-950/30 shadow-[0_0_60px_rgba(34,197,94,0.25)] backdrop-blur-md p-8 text-center">
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-green-600/20 grid place-items-center ring-1 ring-green-500/40">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-green-400">
            <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-green-300">Lecture Complete</h1>
        <p className="mt-2 text-green-200/80">
          Nicely done. You mastered every subtopic in this lecture.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/learn"
            className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 bg-green-600 text-white hover:bg-green-500 transition"
          >
            Learn something new
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 border border-green-500/40 text-green-200 hover:bg-green-500/10 transition"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
