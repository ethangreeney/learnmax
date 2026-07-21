'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Circle,
  Focus,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

type ShortAnswer = {
  id?: string;
  prompt: string;
  rubric?: string;
  modelAnswer?: string;
};

type ShortQuestion = { kind: 'short'; data: ShortAnswer };

type GeneratedQuestion =
  | ShortQuestion
  | {
      kind: 'mcq';
      data: {
        id?: string;
        prompt: string;
        options: string[];
        answerIndex: number;
        explanation?: string;
      };
    };

type Grade = {
  score: number;
  modelAnswer?: string;
  feedback?: string;
  gradedAnswer?: string;
};

export default function ReviseClient({
  lecture,
}: {
  lecture: {
    id: string;
    title: string;
    originalContent: string;
    subtopics: Array<{
      id: string;
      title: string;
      overview: string;
      explanation: string;
    }>;
  };
}) {
  const firstSubtopicId = lecture.subtopics[0]?.id || '';
  const [items, setItems] = useState<ShortQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubtopicId, setSelectedSubtopicId] =
    useState<string>(firstSubtopicId);
  const [activeSubtopicId, setActiveSubtopicId] = useState<string>('');
  const [shortAns, setShortAns] = useState<Record<number, string>>({});
  const [shortScore, setShortScore] = useState<Record<number, Grade>>({});
  const [grading, setGrading] = useState<Record<number, boolean>>({});
  const [gradingError, setGradingError] = useState<
    Record<number, string | undefined>
  >({});
  const [progress, setProgress] = useState(0);
  const initializedLectureRef = useRef<string | null>(null);

  const selectedSubtopicTitle = useMemo(
    () =>
      lecture.subtopics.find((topic) => topic.id === selectedSubtopicId)
        ?.title || 'All lesson topics',
    [lecture.subtopics, selectedSubtopicId]
  );

  const activeSubtopicTitle = useMemo(
    () =>
      lecture.subtopics.find((topic) => topic.id === activeSubtopicId)?.title ||
      selectedSubtopicTitle,
    [lecture.subtopics, activeSubtopicId, selectedSubtopicTitle]
  );

  const gradedScores = useMemo(
    () =>
      Object.entries(shortScore)
        .filter(([index, result]) => {
          if (!result?.gradedAnswer) return true;
          return (
            result.gradedAnswer.trim() ===
            String(shortAns[Number(index)] || '').trim()
          );
        })
        .map(([, result]) => Number(result?.score))
        .filter(Number.isFinite),
    [shortAns, shortScore]
  );
  const gradedCount = gradedScores.length;
  const masteredCount = gradedScores.filter((score) => score >= 8).length;
  const averageScore = gradedScores.length
    ? Math.round(
        (gradedScores.reduce((total, score) => total + score, 0) /
          gradedScores.length) *
          10
      ) / 10
    : 0;
  const sessionProgress = items.length
    ? Math.round((gradedCount / items.length) * 100)
    : 0;

  const generateSet = useCallback(
    async (subtopicId: string) => {
      setLoading(true);
      setProgress(0);
      setError(null);
      try {
        const res = await fetch('/api/revise/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lectureId: lecture.id,
            subtopicId: subtopicId || undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || 'Could not prepare this practice set');
        }
        const data = (await res.json()) as {
          questions?: GeneratedQuestion[];
        };
        const questions = (data.questions || []).filter(
          (question): question is ShortQuestion =>
            question?.kind === 'short' &&
            Boolean(String(question.data?.prompt || '').trim())
        );
        if (questions.length === 0) {
          throw new Error('No practice questions were returned');
        }
        setItems(questions);
        setShortAns({});
        setShortScore({});
        setGrading({});
        setGradingError({});
        setActiveSubtopicId(subtopicId);
      } catch (caught: any) {
        setError(
          caught?.message ||
            'This practice set could not be prepared. Please try again.'
        );
      } finally {
        setProgress(100);
        setLoading(false);
      }
    },
    [lecture.id]
  );

  useEffect(() => {
    if (initializedLectureRef.current === lecture.id) return;
    initializedLectureRef.current = lecture.id;

    try {
      const key = `revise:${lecture.id}`;
      const raw =
        typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        const restoredItems = Array.isArray(parsed.items)
          ? parsed.items.filter(
              (question: GeneratedQuestion): question is ShortQuestion =>
                question?.kind === 'short' &&
                Boolean(String(question.data?.prompt || '').trim())
            )
          : [];
        if (restoredItems.length > 0) {
          setItems(restoredItems);
          if (parsed.shortAns) setShortAns(parsed.shortAns);
          if (parsed.shortScore) setShortScore(parsed.shortScore);
          const restoredSelection = lecture.subtopics.some(
            (topic) => topic.id === parsed.selectedSubtopicId
          )
            ? parsed.selectedSubtopicId
            : firstSubtopicId;
          const restoredActive = lecture.subtopics.some(
            (topic) => topic.id === parsed.activeSubtopicId
          )
            ? parsed.activeSubtopicId
            : restoredSelection;
          setSelectedSubtopicId(restoredSelection);
          setActiveSubtopicId(restoredActive);
          return;
        }
      }
    } catch {}

    void generateSet(firstSubtopicId);
  }, [lecture.id, lecture.subtopics, firstSubtopicId, generateSet]);

  useEffect(() => {
    try {
      const key = `revise:${lecture.id}`;
      const payload = JSON.stringify({
        items,
        shortAns,
        shortScore,
        selectedSubtopicId,
        activeSubtopicId,
        summary: {
          attempted: gradedCount,
          mcqCorrect: 0,
          mcqTotal: 0,
          shortScores: gradedScores,
        },
      });
      if (typeof window !== 'undefined')
        window.localStorage.setItem(key, payload);
    } catch {}
  }, [
    lecture.id,
    items,
    shortAns,
    shortScore,
    selectedSubtopicId,
    activeSubtopicId,
    gradedCount,
    gradedScores,
  ]);

  useEffect(() => {
    if (!loading) return;
    setProgress(0);
    let value = 0;
    const id = window.setInterval(() => {
      value = Math.min(92, value + (value < 60 ? 5 : value < 80 ? 3 : 1));
      setProgress(value);
    }, 140);
    return () => window.clearInterval(id);
  }, [loading]);

  const submitShort = async (index: number) => {
    const question = items[index];
    const answer = (shortAns[index] || '').trim();
    if (!question || !answer || grading[index]) return;

    setGradingError((current) => ({ ...current, [index]: undefined }));
    setGrading((current) => ({ ...current, [index]: true }));
    try {
      const res = await fetch('/api/revise/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lectureId: lecture.id,
          prompt: question.data.prompt,
          answer,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not grade this answer');
      }
      const data = (await res.json()) as Grade;
      const score = Math.max(0, Math.min(10, Number(data.score)));
      if (!Number.isFinite(score)) throw new Error('Invalid score returned');
      setShortScore((current) => ({
        ...current,
        [index]: {
          score,
          modelAnswer: data.modelAnswer,
          feedback: data.feedback,
          gradedAnswer: answer,
        },
      }));
      try {
        window.dispatchEvent(new Event('elo:maybeRefresh'));
      } catch {}
    } catch (caught: any) {
      setGradingError((current) => ({
        ...current,
        [index]:
          caught?.message ||
          'Your answer could not be graded. It is still here—please try again.',
      }));
    } finally {
      setGrading((current) => ({ ...current, [index]: false }));
    }
  };

  return (
    <div className="space-y-8 pb-8" aria-busy={loading || undefined}>
      <style>{`
        @keyframes learnmax-revise-enter {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes learnmax-focus-ring {
          0%, 100% { transform: scale(.9); opacity: .2; }
          50% { transform: scale(1.15); opacity: .5; }
        }
        @media (prefers-reduced-motion: reduce) {
          .revise-enter, .focus-ring { animation: none !important; }
        }
      `}</style>
      <header className="revise-enter relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5 shadow-[0_24px_80px_-55px_rgba(16,185,129,0.25)] motion-safe:animate-[learnmax-revise-enter_500ms_cubic-bezier(0.22,1,0.36,1)_both] sm:p-6 xl:flex xl:items-end xl:justify-between xl:gap-8">
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="h-px w-7 bg-emerald-400/80" aria-hidden="true" />
            <div className="text-xs font-semibold tracking-[0.16em] text-[rgb(var(--accent))] uppercase">
              Revision practice
            </div>
          </div>
          <h1 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
            {lecture.title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Recall first. Use the feedback second. Repeat until you can explain
            the idea without support.
          </p>
        </div>
        <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row xl:mt-0 xl:w-auto">
          {lecture.subtopics.length > 0 && (
            <label className="min-w-0 flex-1 xl:w-56">
              <span className="sr-only">Choose a topic to practise</span>
              <select
                value={selectedSubtopicId}
                onChange={(event) => setSelectedSubtopicId(event.target.value)}
                disabled={loading}
                className="h-11 w-full cursor-pointer truncate rounded-lg border border-neutral-700 bg-neutral-900 px-3 pr-8 text-sm text-white transition-[border-color,background-color,box-shadow] outline-none hover:border-neutral-600 hover:bg-neutral-800 focus:border-[rgb(var(--accent))] focus:ring-4 focus:ring-[rgba(var(--accent),0.1)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                title={selectedSubtopicTitle}
              >
                {lecture.subtopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title || 'Untitled topic'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => void generateSet(selectedSubtopicId)}
            className="group/set inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-4 text-sm font-semibold text-black shadow-lg shadow-emerald-500/10 transition-[filter,transform,box-shadow] hover:-translate-y-0.5 hover:shadow-emerald-500/20 hover:brightness-105 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw
                className="h-4 w-4 transition-transform duration-300 group-hover/set:rotate-45 motion-reduce:transform-none motion-reduce:transition-none"
                aria-hidden="true"
              />
            )}
            {loading ? 'Preparing…' : 'New practice set'}
          </button>
        </div>
      </header>

      {!loading && items.length > 0 && (
        <section
          className="revise-enter relative grid gap-5 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/35 p-5 motion-safe:animate-[learnmax-revise-enter_500ms_80ms_cubic-bezier(0.22,1,0.36,1)_both] sm:grid-cols-[1fr_auto_auto] sm:items-center"
          aria-label="Revision session progress"
        >
          <div
            className="absolute inset-y-4 left-0 w-px bg-emerald-400/50"
            aria-hidden="true"
          />
          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="text-xs tracking-[0.12em] text-neutral-500 uppercase">
                  Current topic
                </div>
                <div className="mt-1 truncate font-medium text-neutral-200">
                  {activeSubtopicTitle}
                </div>
              </div>
              <div className="text-xs font-medium text-neutral-400 sm:hidden">
                {gradedCount}/{items.length} answered
              </div>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800"
              role="progressbar"
              aria-label="Questions answered"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={sessionProgress}
            >
              <div
                className="h-full rounded-full bg-[rgb(var(--accent))] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${sessionProgress}%` }}
              />
            </div>
          </div>
          <div className="hidden min-w-24 border-l border-neutral-800 pl-5 sm:block">
            <div className="text-xs text-neutral-500">Answered</div>
            <div className="mt-1 text-lg font-semibold">
              {gradedCount}/{items.length}
            </div>
          </div>
          <div className="min-w-24 border-t border-neutral-800 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
            <div className="text-xs text-neutral-500">Average</div>
            <div className="mt-1 text-lg font-semibold">
              {gradedCount ? `${averageScore}/10` : '—'}
            </div>
          </div>
        </section>
      )}

      {error && (
        <div
          className="revise-enter rounded-xl border border-red-900/70 bg-red-950/20 p-4 motion-safe:animate-[learnmax-revise-enter_260ms_ease-out_both]"
          role="alert"
        >
          <div className="font-medium text-red-200">
            This practice set did not load
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Your previous work is still safe. Try preparing the selected topic
            again.
          </p>
          <button
            type="button"
            onClick={() => void generateSet(selectedSubtopicId)}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div
          className="revise-enter relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/45 p-6 motion-safe:animate-[learnmax-revise-enter_300ms_ease-out_both]"
          role="status"
          aria-live="polite"
          aria-label="Preparing your revision questions"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/20 bg-[rgba(var(--accent),0.1)]">
              <span
                className="focus-ring absolute inset-0 rounded-full border border-emerald-400/40 motion-safe:animate-[learnmax-focus-ring_1.8s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              <Focus
                className="h-5 w-5 text-[rgb(var(--accent))]"
                aria-hidden="true"
              />
            </div>
            <div>
              <div className="text-sm font-medium text-neutral-200">
                Preparing recall prompts…
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                Using only the material in this lesson.
              </div>
            </div>
          </div>
          <div
            className="mt-5 h-2 w-full overflow-hidden rounded-full bg-neutral-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className="h-full rounded-full bg-[rgb(var(--accent))] transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
            />
          </div>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="revise-enter rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/30 p-10 text-center motion-safe:animate-[learnmax-revise-enter_400ms_ease-out_both]">
          <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-400">
            <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">Ready when you are</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-400">
            Choose a topic and start a practice set to test what you can recall
            without looking back at the lesson.
          </p>
          <button
            type="button"
            onClick={() => void generateSet(selectedSubtopicId)}
            className="group/start mt-5 inline-flex items-center gap-2 rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
          >
            Start practising
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover/start:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ol className="space-y-6" aria-label="Revision questions">
          {items.map((question, index) => {
            const result = shortScore[index];
            const answerChangedSinceGrade = Boolean(
              result?.gradedAnswer &&
                result.gradedAnswer.trim() !==
                  String(shortAns[index] || '').trim()
            );
            const isMastered =
              typeof result?.score === 'number' &&
              result.score >= 8 &&
              !answerChangedSinceGrade;
            const answerId = `revision-answer-${index}`;
            const hintId = `revision-answer-hint-${index}`;
            const wordCount = shortAns[index]?.trim()
              ? shortAns[index].trim().split(/\s+/).length
              : 0;

            return (
              <li
                key={question.data.id || index}
                className="revise-enter group/question relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/40 p-5 shadow-[0_24px_65px_-50px_rgba(0,0,0,0.95)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-neutral-700 hover:shadow-[0_28px_75px_-48px_rgba(16,185,129,0.12)] motion-safe:animate-[learnmax-revise-enter_460ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:transform-none motion-reduce:transition-none sm:p-6 md:p-8"
                style={{ animationDelay: `${Math.min(index * 65, 260)}ms` }}
              >
                <div
                  className={`absolute top-6 bottom-6 left-0 w-px transition-colors duration-300 motion-reduce:transition-none ${
                    answerChangedSinceGrade
                      ? 'bg-neutral-700'
                      : isMastered
                        ? 'bg-emerald-400/70'
                        : result
                          ? 'bg-amber-400/60'
                          : 'bg-neutral-700 group-hover/question:bg-emerald-400/35'
                  }`}
                  aria-hidden="true"
                />
                <div className="flex items-start gap-3 sm:gap-4">
                  <div
                    className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl border text-xs font-semibold transition-transform duration-300 group-hover/question:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none ${
                      answerChangedSinceGrade
                        ? 'border-neutral-700 bg-neutral-900 text-neutral-400'
                        : isMastered
                          ? 'border-emerald-700 bg-emerald-950/50 text-emerald-300'
                          : result
                            ? 'border-amber-700 bg-amber-950/40 text-amber-200'
                            : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                    }`}
                    aria-hidden="true"
                  >
                    {isMastered ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                      <span>Question {String(index + 1).padStart(2, '0')}</span>
                      <span className="text-neutral-700" aria-hidden="true">
                        /
                      </span>
                      <span>Explain from memory</span>
                    </div>
                    <div className="chat-md text-base leading-7 font-medium text-neutral-100 sm:text-lg">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {question.data.prompt}
                      </ReactMarkdown>
                    </div>

                    <div className="mt-5 space-y-3">
                      <label
                        htmlFor={answerId}
                        className="block text-sm font-medium text-neutral-300"
                      >
                        Your answer
                      </label>
                      <textarea
                        id={answerId}
                        aria-describedby={hintId}
                        className="w-full rounded-xl border border-neutral-700 bg-neutral-900/75 p-4 text-sm leading-7 transition-[border-color,background-color,box-shadow] duration-200 outline-none placeholder:text-neutral-600 hover:border-neutral-600 hover:bg-neutral-900 focus:border-[rgb(var(--accent))] focus:bg-neutral-900 focus:ring-4 focus:ring-[rgba(var(--accent),0.1)] motion-reduce:transition-none"
                        rows={5}
                        value={shortAns[index] || ''}
                        onChange={(event) =>
                          setShortAns((current) => ({
                            ...current,
                            [index]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (
                            (event.metaKey || event.ctrlKey) &&
                            event.key === 'Enter'
                          ) {
                            event.preventDefault();
                            void submitShort(index);
                          }
                        }}
                        placeholder="Explain what you remember in your own words…"
                      />
                      <div
                        id={hintId}
                        className="flex items-center justify-between gap-3 text-xs text-neutral-500"
                      >
                        <span>⌘/Ctrl + Enter to grade</span>
                        <span>
                          {wordCount} {wordCount === 1 ? 'word' : 'words'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void submitShort(index)}
                        disabled={grading[index] || !shortAns[index]?.trim()}
                        className="group/grade inline-flex items-center gap-2 rounded-lg bg-[rgb(var(--accent))] px-4 py-2.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/10 transition-[filter,transform,box-shadow] hover:-translate-y-0.5 hover:shadow-emerald-500/20 hover:brightness-105 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
                      >
                        {grading[index] && (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {grading[index]
                          ? 'Grading answer…'
                          : result
                            ? 'Grade revised answer'
                            : 'Grade my answer'}
                        {!grading[index] && (
                          <ArrowRight
                            className="h-4 w-4 transition-transform duration-200 group-hover/grade:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                            aria-hidden="true"
                          />
                        )}
                      </button>

                      {gradingError[index] && (
                        <div
                          className="rounded-md border border-red-900/70 bg-red-950/20 p-3 text-sm text-red-200"
                          role="alert"
                        >
                          Your answer could not be graded. It is still
                          here—please try again.
                        </div>
                      )}

                      {result && (
                        <div
                          className={`rounded-xl border p-4 shadow-inner shadow-black/10 motion-safe:animate-[learnmax-revise-enter_260ms_ease-out_both] ${
                            answerChangedSinceGrade
                              ? 'border-neutral-700 bg-neutral-900/50'
                              : isMastered
                                ? 'border-emerald-800 bg-emerald-950/30'
                                : 'border-amber-800 bg-amber-950/25'
                          }`}
                          role="status"
                          aria-live="polite"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div
                              className={`inline-flex items-center gap-2 font-semibold ${answerChangedSinceGrade ? 'text-neutral-200' : isMastered ? 'text-emerald-200' : 'text-amber-100'}`}
                            >
                              {isMastered ? (
                                <CheckCircle2
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Circle
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              )}
                              {answerChangedSinceGrade
                                ? 'Answer changed—grade it again'
                                : isMastered
                                  ? 'Strong recall'
                                  : 'Review, improve, and try again'}
                            </div>
                            <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-1.5 text-sm text-neutral-300 tabular-nums">
                              <span className="text-lg font-semibold text-white">
                                {result.score}
                              </span>
                              /10
                            </div>
                          </div>
                          {!isMastered && !answerChangedSinceGrade && (
                            <p className="mt-2 text-sm text-neutral-400">
                              Use the feedback below, strengthen the answer, and
                              aim for 8/10 or higher.
                            </p>
                          )}
                        </div>
                      )}

                      {result?.feedback && (
                        <div className="chat-md relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-sm leading-6 text-neutral-300 motion-safe:animate-[learnmax-revise-enter_300ms_60ms_ease-out_both]">
                          <span
                            className="absolute inset-y-3 left-0 w-px bg-emerald-400/45"
                            aria-hidden="true"
                          />
                          <div className="mb-2 text-xs font-semibold tracking-[0.12em] text-neutral-500 uppercase">
                            What to improve
                          </div>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {result.feedback}
                          </ReactMarkdown>
                        </div>
                      )}

                      {result?.modelAnswer && (
                        <details className="group/answer rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 text-sm text-neutral-400 transition-colors open:border-neutral-700 open:bg-neutral-900/50 motion-reduce:transition-none">
                          <summary className="cursor-pointer font-medium text-neutral-300 transition-colors marker:text-neutral-500 hover:text-white motion-reduce:transition-none">
                            Compare with a strong answer
                          </summary>
                          <div className="chat-md mt-3 border-t border-neutral-800 pt-3">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {result.modelAnswer}
                            </ReactMarkdown>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!loading && gradedCount > 0 && (
        <section
          className="revise-enter relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/40 shadow-[0_24px_70px_-50px_rgba(16,185,129,0.15)] motion-safe:animate-[learnmax-revise-enter_420ms_ease-out_both]"
          aria-label="Session summary"
        >
          <div
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/55 to-transparent"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                {gradedCount === items.length
                  ? 'Practice set complete'
                  : 'Keep the momentum going'}
              </h2>
              <p className="mt-1 text-sm text-neutral-400">
                {masteredCount} of {items.length} answers scored 8/10 or higher.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-xs text-neutral-500">Average</div>
                <div className="mt-1 text-2xl font-bold">{averageScore}/10</div>
              </div>
              <button
                type="button"
                onClick={() => void generateSet(selectedSubtopicId)}
                className="group/another inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-neutral-800 active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
              >
                Practise another set
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover/another:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
