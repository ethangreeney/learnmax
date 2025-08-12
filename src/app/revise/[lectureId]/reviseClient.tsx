'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

type MCQ = {
  id?: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation?: string;
};

type ShortAnswer = {
  id?: string;
  prompt: string;
  rubric?: string;
  modelAnswer?: string;
};

type MixedQuestion =
  | { kind: 'mcq'; data: MCQ }
  | { kind: 'short'; data: ShortAnswer };

export default function ReviseClient({
  lecture,
}: {
  lecture: {
    id: string;
    title: string;
    originalContent: string;
    subtopics: Array<{ id: string; title: string; overview: string; explanation: string }>;
  };
}) {
  const [items, setItems] = useState<MixedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    attempted: number;
    mcqCorrect: number;
    mcqTotal: number;
    shortScores: number[];
  }>({ attempted: 0, mcqCorrect: 0, mcqTotal: 0, shortScores: [] });

  // Declare per-question states BEFORE any callbacks/effects that reference them
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number | undefined>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [shortAns, setShortAns] = useState<Record<number, string>>({});
  const [shortScore, setShortScore] = useState<Record<number, { score: number; modelAnswer?: string }>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});

  const lectureDoc = useMemo(() => {
    const parts: string[] = [
      `# ${lecture.title}`,
      ...lecture.subtopics.map((s) => {
        const b: string[] = [];
        if (s.title) b.push(`\n## ${s.title}`);
        if (s.overview) b.push(s.overview);
        if (s.explanation) b.push(s.explanation);
        return b.join('\n\n');
      }),
    ];
    const doc = parts.join('\n\n').trim();
    return doc.length >= 50 ? doc : lecture.originalContent;
  }, [lecture]);

  const generateSet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/revise/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId: lecture.id }),
      });
      if (!res.ok) throw new Error('Failed to generate');
      const data = (await res.json()) as { questions: MixedQuestion[] };
      const qs = data.questions || [];
      setItems(qs);
      // Reset session state for new set
      setMcqAnswers({});
      setRevealed({});
      setShortAns({});
      setShortScore({});
      setSummary({ attempted: 0, mcqCorrect: 0, mcqTotal: 0, shortScores: [] });
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }, [lecture.id]);

  useEffect(() => {
    // Restore from localStorage if present
    try {
      const key = `revise:${lecture.id}`;
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && parsed.items.length) setItems(parsed.items);
        if (parsed.mcqAnswers) setMcqAnswers(parsed.mcqAnswers);
        if (parsed.revealed) setRevealed(parsed.revealed);
        if (parsed.shortAns) setShortAns(parsed.shortAns);
        if (parsed.shortScore) setShortScore(parsed.shortScore);
        if (parsed.summary) setSummary(parsed.summary);
        return;
      }
    } catch {}
    void generateSet();
  }, [generateSet]);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      const key = `revise:${lecture.id}`;
      const payload = JSON.stringify({ items, mcqAnswers, revealed, shortAns, shortScore, summary });
      if (typeof window !== 'undefined') window.localStorage.setItem(key, payload);
    } catch {}
  }, [lecture.id, items, mcqAnswers, revealed, shortAns, shortScore, summary]);

  const submitShort = async (idx: number) => {
    const q = items[idx];
    if (!q || q.kind !== 'short') return;
    const answer = (shortAns[idx] || '').trim();
    if (!answer) return;
    setGrading((g) => ({ ...g, [idx]: true }));
    try {
      const res = await fetch('/api/revise/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId: lecture.id, prompt: q.data.prompt, answer }),
      });
      if (!res.ok) throw new Error('Failed to grade');
      const data = (await res.json()) as { score: number; modelAnswer?: string };
      setShortScore((m) => ({ ...m, [idx]: { score: data.score, modelAnswer: data.modelAnswer } }));
      setSummary((s) => ({
        ...s,
        attempted: s.attempted + 1,
        shortScores: [...s.shortScores, data.score],
      }));
      // The server may have incremented Elo based on score thresholds; request navbar refresh
      try {
        window.dispatchEvent(new Event('elo:maybeRefresh'));
      } catch {}
    } catch (e: any) {
      // ignore
    } finally {
      setGrading((g) => ({ ...g, [idx]: false }));
    }
  };

  const checkMcq = (idx: number) => {
    setRevealed((r) => ({ ...r, [idx]: true }));
    const q = items[idx];
    if (!q || q.kind !== 'mcq') return;
    const sel = mcqAnswers[idx];
    if (typeof sel !== 'number') return;
    setSummary((s) => ({
      ...s,
      attempted: s.attempted + 1,
      mcqTotal: s.mcqTotal + 1,
      mcqCorrect: s.mcqCorrect + (sel === q.data.answerIndex ? 1 : 0),
    }));
  };

  const retryMcq = (idx: number) => {
    setMcqAnswers((m) => ({ ...m, [idx]: undefined }));
    setRevealed((r) => ({ ...r, [idx]: false }));
  };

  const resetSet = () => {
    setItems([]);
    setMcqAnswers({});
    setRevealed({});
    setShortAns({});
    setShortScore({});
    void generateSet();
  };

  const avgShort = useMemo(() => {
    const arr = summary.shortScores;
    return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
  }, [summary.shortScores]);

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Revise: {lecture.title}</h1>
          <p className="text-sm text-neutral-400">Mixed practice: MCQ + Short Answer</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="rounded-md border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            Back to Dashboard
          </Link>
          <button
            onClick={resetSet}
            className="rounded-md border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Preparing…' : 'New mixed set'}
          </button>
        </div>
      </header>

      {error && <div className="text-sm text-red-400">{error}</div>}

      <ul className="space-y-6">
        {items.map((q, idx) => (
          <li key={idx} className="card p-6">
            <div className="chat-md font-medium text-neutral-200">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {q.kind === 'mcq' ? q.data.prompt : q.data.prompt}
              </ReactMarkdown>
            </div>

            {q.kind === 'mcq' ? (
              <div className="mt-3 space-y-3">
                {q.data.options.map((opt, j) => {
                  const selected = mcqAnswers[idx];
                  const isSelected = selected === j;
                  const show = revealed[idx];
                  const isCorrect = show && j === q.data.answerIndex;
                  const isIncorrect = show && isSelected && j !== q.data.answerIndex;
                  const cls = `rounded-md border p-3 text-left transition-all text-sm ${
                    isCorrect
                      ? 'border-green-500 bg-green-900/30'
                      : isIncorrect
                        ? 'border-red-500 bg-red-900/30'
                        : isSelected
                          ? 'border-blue-500 bg-blue-900/20'
                          : 'border-neutral-700 hover:bg-neutral-800'
                  }`;
                  return (
                    <button
                      key={j}
                      className={cls}
                      onClick={() => setMcqAnswers((m) => ({ ...m, [idx]: j }))}
                    >
                      <span className="chat-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {opt}
                        </ReactMarkdown>
                      </span>
                    </button>
                  );
                })}
                <div className="pt-2">
                  {!revealed[idx] ? (
                    <button
                      onClick={() => checkMcq(idx)}
                      className="rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black"
                    >
                      Check Answer
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => retryMcq(idx)}
                          className="rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
                        >
                          Try Again
                        </button>
                      </div>
                      {q.data.explanation && (
                        <div className="chat-md mt-1 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {q.data.explanation}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <textarea
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 p-3 text-sm"
                  rows={5}
                  value={shortAns[idx] || ''}
                  onChange={(e) => setShortAns((m) => ({ ...m, [idx]: e.target.value }))}
                  placeholder="Write your answer..."
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => submitShort(idx)}
                    disabled={grading[idx] || !shortAns[idx]?.trim()}
                    className="rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    {grading[idx] ? 'Grading…' : 'Submit'}
                  </button>
                  {typeof shortScore[idx]?.score === 'number' && (
                    <span className="text-sm text-neutral-300">
                      Score: <span className="font-semibold">{shortScore[idx]!.score}/10</span>
                    </span>
                  )}
                </div>
                {shortScore[idx]?.modelAnswer && (
                  <div className="chat-md mt-2 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                    <div className="text-neutral-400">Model answer:</div>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {shortScore[idx]!.modelAnswer as string}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="card p-6">
        <h3 className="text-xl font-semibold">Session Summary</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-neutral-300 md:grid-cols-3">
          <div>
            <div className="text-neutral-400">Attempted</div>
            <div className="text-lg font-semibold">{summary.attempted}</div>
          </div>
          <div>
            <div className="text-neutral-400">MCQ Correct</div>
            <div className="text-lg font-semibold">{summary.mcqCorrect}/{summary.mcqTotal}</div>
          </div>
          <div>
            <div className="text-neutral-400">Short Answer Avg</div>
            <div className="text-lg font-semibold">{avgShort || 0}/10</div>
          </div>
        </div>
      </div>
    </div>
  );
}


