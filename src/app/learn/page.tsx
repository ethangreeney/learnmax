// 'use client' makes this a valid client component with a default export.
'use client';

import { useState } from 'react';

async function createLectureFromText(
  content: string
): Promise<{ lectureId: string }> {
  let model: string | undefined;
  try { model = localStorage.getItem('ai:model') || undefined; } catch {}
  const res = await fetch('/api/lectures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, model }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export default function LearnWorkspacePage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const { lectureId } = await createLectureFromText(text);
      window.location.href = `/learn/${lectureId}`;
    } catch (e: any) {
      setErr(e.message || 'Failed to create lecture.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-narrow space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Learn Workspace</h1>
        <p className="text-sm text-neutral-400">
          Paste text and create a persistent lecture. You’ll be redirected to
          the lecture page with explanations and quizzes.
        </p>
      </header>

      <div className="space-y-4 card p-5">
        <textarea
          className="min-h-[160px] input"
          placeholder="What do you want to learn about? Paste any study notes or PDF lecture slides here"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={loading || !input.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {loading ? 'Generating lesson, this may take a while…' : 'Create Lecture'}
          </button>
          <button
            onClick={() => setInput('')}
            disabled={loading}
            className="btn-ghost disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        {err && (
          <div className="text-sm text-red-400" role="alert">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
