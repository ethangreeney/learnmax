'use client';

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
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string>(lecture.subtopics[0]?.id || '');
  const [activeSubtopicId, setActiveSubtopicId] = useState<string>('');

  // Declare per-question states BEFORE any callbacks/effects that reference them
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number | undefined>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [shortAns, setShortAns] = useState<Record<number, string>>({});
  const [shortScore, setShortScore] = useState<Record<number, { score: number; modelAnswer?: string; feedback?: string }>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});
  const [progress, setProgress] = useState<number>(0);

  const activeSubtopicTitle = useMemo(() => {
    const found = lecture.subtopics.find((s) => s.id === activeSubtopicId);
    return found?.title || 'Select a subtopic';
  }, [lecture.subtopics, activeSubtopicId]);

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

  const generateSet = useCallback(async (subId: string) => {
    setLoading(true);
    setProgress(0);
    setError(null);
    try {
      const res = await fetch('/api/revise/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId: lecture.id, subtopicId: subId || undefined }),
      });
      if (!res.ok) throw new Error('Failed to generate');
      const data = (await res.json()) as { questions: MixedQuestion[] };
      const qs = (data.questions || []).filter((q) => q.kind === 'short');
      setItems(qs);
      // Reset session state for new set
      setMcqAnswers({});
      setRevealed({});
      setShortAns({});
      setShortScore({});
      setSummary({ attempted: 0, mcqCorrect: 0, mcqTotal: 0, shortScores: [] });
      setActiveSubtopicId(subId);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setProgress(100);
      setLoading(false);
    }
  }, [lecture.id]);

  useEffect(() => {
    // Restore from localStorage if present (only on mount/lecture change)
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
        if (parsed.selectedSubtopicId) setSelectedSubtopicId(parsed.selectedSubtopicId);
        if (parsed.activeSubtopicId) setActiveSubtopicId(parsed.activeSubtopicId);
        return;
      }
    } catch { }
    // Initial generation uses first subtopic when available
    const initialSubId = lecture.subtopics[0]?.id || selectedSubtopicId || '';
    if (initialSubId !== selectedSubtopicId && initialSubId) setSelectedSubtopicId(initialSubId);
    void generateSet(initialSubId);
  }, [lecture.id]);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      const key = `revise:${lecture.id}`;
      const payload = JSON.stringify({ items, mcqAnswers, revealed, shortAns, shortScore, summary, selectedSubtopicId, activeSubtopicId });
      if (typeof window !== 'undefined') window.localStorage.setItem(key, payload);
    } catch { }
  }, [lecture.id, items, mcqAnswers, revealed, shortAns, shortScore, summary, selectedSubtopicId, activeSubtopicId]);

  // Animate a determinate-feel progress bar while loading
  useEffect(() => {
    if (!loading) return;
    setProgress(0);
    let p = 0;
    const id = window.setInterval(() => {
      // Ease out: fast at start, slower near ~92%
      p = Math.min(92, p + (p < 60 ? 5 : p < 80 ? 3 : 1));
      setProgress(p);
    }, 140);
    return () => window.clearInterval(id);
  }, [loading]);

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
      const data = (await res.json()) as { score: number; modelAnswer?: string; feedback?: string };
      setShortScore((m) => ({ ...m, [idx]: { score: data.score, modelAnswer: data.modelAnswer, feedback: data.feedback } }));
      setSummary((s) => ({
        ...s,
        attempted: s.attempted + 1,
        shortScores: [...s.shortScores, data.score],
      }));
      // The server may have incremented Elo based on score thresholds; request navbar refresh
      try {
        window.dispatchEvent(new Event('elo:maybeRefresh'));
      } catch { }
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
    void generateSet(selectedSubtopicId || '');
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
          <p className="text-sm text-neutral-400">{activeSubtopicTitle}</p>
        </div>
        <div className="flex gap-2">
          {lecture.subtopics.length > 0 && (
            <select
              value={selectedSubtopicId}
              onChange={(e) => setSelectedSubtopicId(e.target.value)}
              disabled={loading}
              className="rounded-md border border-neutral-600 bg-neutral-900 px-4 pr-8 py-2 text-sm text-white text-center hover:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-[rgb(var(--accent))] w-48 cursor-pointer truncate"
              aria-label="Choose subtopic"
              title={lecture.subtopics.find((s) => s.id === selectedSubtopicId)?.title || 'Choose subtopic'}
            >
              {lecture.subtopics.map((s) => (
                <option key={s.id} value={s.id} title={s.title || 'Untitled subtopic'}>
                  {s.title || 'Untitled subtopic'}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => generateSet(selectedSubtopicId || '')}
            className="rounded-md border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50 text-center"
            disabled={loading}
          >
            {loading ? 'Preparing…' : 'New short-answer set'}
          </button>
        </div>
      </header>

      {error && <div className="text-sm text-red-400">{error}</div>}

      {loading && (
        <div className="card p-6" role="status" aria-live="polite" aria-label="Preparing your short-answer set…">
          <div className="space-y-3">
            <div className="text-sm text-neutral-300">Preparing your short-answer set…</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div
                className="h-2 rounded-full bg-[rgb(var(--accent))] transition-[width] duration-200"
                style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="text-xs text-neutral-500">Grounding in your lesson and composing short-answer questions…</div>
          </div>
        </div>
      )}

      <ul className="space-y-6">
        {items.map((q, idx) => (
          <li key={idx} className="card p-6">
            <div className="chat-md font-medium text-neutral-200">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                {q.kind === 'mcq' ? q.data.prompt : q.data.prompt}
              </ReactMarkdown>
            </div>

            {q.kind === 'short' && (
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
                {shortScore[idx]?.feedback && (
                  <div className="chat-md mt-2 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                    <div className="text-neutral-400">Feedback:</div>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {shortScore[idx]!.feedback as string}
                    </ReactMarkdown>
                  </div>
                )}
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
        <div className="mt-2 grid grid-cols-1 gap-3 text-sm text-neutral-300 md:grid-cols-2">
          <div>
            <div className="text-neutral-400">Attempted</div>
            <div className="text-lg font-semibold">{summary.attempted}</div>
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


