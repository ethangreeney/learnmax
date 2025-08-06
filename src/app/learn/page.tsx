'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLearnStore } from '@/lib/learn-store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ExplanationStyle } from '@/app/api/explain/route';
import { Loader2, Wand2 } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';

async function postJSON<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed: ${res.status}`); }
  return res.json();
}
async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed: `); }
  return res.json();
}

const TopicProgressBar = ({ current, total }: { current: number, total: number }) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-baseline text-sm">
        <span className="font-medium text-neutral-300">Topic Progress</span>
        <span className="text-neutral-400">{current} / {total} Mastered</span>
      </div>
      <div className="w-full bg-neutral-800 rounded-full h-2.5">
        <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
};

export default function Learn() {
  const [input, setInput] = useState('');
  const {
    topic, subtopics, unlockedIndex, currentIndex, content, explanation, quiz, loading, error,
    setContent, setBreakdown, setExplanation, setQuiz, setLoading, setError, selectIndex, unlockNext, resetAll,
  } = useLearnStore();

  const currentSubtopic = subtopics[currentIndex];
  const isSubtopicActive = currentSubtopic != null;

  const performAnalysis = async (text: string) => {
    try {
      setContent(text);
      setBreakdown('Analyzing, please wait...', []);
      const bd = await postJSON<{ topic: string; subtopics: any[] }>('/api/breakdown', { content: text });
      setBreakdown(bd.topic, bd.subtopics);
      const qz = await postJSON<{ questions: any[] }>('api/quiz', { subtopics: bd.subtopics });
      setQuiz(qz.questions);
    } catch (e: any) {
      setError(e.message || 'Failed to analyze content.');
      setBreakdown('Analysis Failed', []);
    }
  };

  const handleTextAnalysis = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(undefined);
    resetAll();
    try {
      await performAnalysis(input);
    } finally {
      setLoading(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (loading) return;
    setLoading(true);
    setError(undefined);
    resetAll();
    setInput('');
    setBreakdown(`Processing ${file.name}...`, []);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await postForm<{ content: string }>('/api/upload-pdf', form);
      await performAnalysis(res.content);
    } catch (e: any) {
      setError(e.message || 'Failed to upload PDF');
      setBreakdown('PDF Upload Failed', []);
    } finally {
      setLoading(false);
    }
  };

  const fetchExplanation = useCallback(async (style: ExplanationStyle = 'default') => {
    if (!currentSubtopic || !content) return;
    setExplanation('Crafting your learning module...');
    try {
      const res = await postJSON<{ explanation: string }>('/api/explain', { content, subtopicTitle: currentSubtopic.title, style });
      // No longer need the client-side parser. Trusting the new prompt.
      setExplanation(res.explanation);
    } catch (e: any) {
      setExplanation('Could not generate explanation. ' + e.message);
    }
  }, [content, currentSubtopic, setExplanation]);
  
  useEffect(() => {
    if (currentSubtopic) {
      fetchExplanation('default');
    }
  }, [currentIndex, currentSubtopic, fetchExplanation]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 px-4">
      {/* --- Left Column: Workspace (2/10 width) --- */}
      <aside className="lg:col-span-2 rounded-lg border border-neutral-800 p-4 space-y-4 self-start">
        <h2 className="text-xl font-semibold">Learn Workspace</h2>
        <div 
          className="relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file) handlePdfUpload(file); }}
        >
          <textarea
              className="w-full min-h-[120px] rounded-md bg-neutral-900 p-3 outline-none ring-1 ring-neutral-700 disabled:opacity-60"
              placeholder="Paste notes or drop a PDF..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
          />
        </div>
        <div className="flex gap-2">
            <button onClick={handleTextAnalysis} disabled={loading || !input.trim()} className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-black font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? ( <> <Loader2 className="w-4 h-4 animate-spin" /> Analyzing... </> ) : ( <> <Wand2 className="w-4 h-4" /> Analyze </> )}
            </button>
            <button onClick={() => { resetAll(); setInput(''); }} disabled={loading} className="rounded-md border border-neutral-700 px-4 py-2 text-neutral-200 disabled:opacity-50">Reset</button>
        </div>
        {error && (<div className="text-sm text-red-400" role="alert">{error}</div>)}
        <hr className="border-neutral-800" />
        <div>
            <div className="mb-2"><div className="text-sm uppercase text-neutral-400">Topic</div><div className="font-semibold text-lg">{topic}</div></div>
            {subtopics.length > 0 && ( <div className="my-4"> <TopicProgressBar current={unlockedIndex} total={subtopics.length} /> </div> )}
            {subtopics.length > 0 && (
                <ul className="space-y-1">{subtopics.map((s, i) => (
                    <li key={i}>
                      <button onClick={() => selectIndex(i)} disabled={i > unlockedIndex} className={`w-full text-left rounded-md px-3 py-2.5 text-sm leading-snug transition-colors ${i > unlockedIndex ? 'text-neutral-600' : i === currentIndex ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-300 hover:bg-neutral-900'}`}>
                        {i + 1}. {s.title}
                      </button>
                    </li>
                ))}</ul>
            )}
        </div>
      </aside>

      {/* --- Center Column: Main Content (5/10 width) --- */}
      <main className="lg:col-span-5">
        {isSubtopicActive ? (
          <div className="space-y-8">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 md:p-8">
                <h3 className="text-3xl font-bold tracking-tight">{currentSubtopic.title}</h3>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-400 mt-2">
                  <span>Importance: {currentSubtopic.importance}</span> <span>•</span> <span>Difficulty: {currentSubtopic.difficulty}</span>
                </div>
                <div className="mt-6 pt-4 border-t border-neutral-800/50 flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-400">Style:</span>
                  <button onClick={() => fetchExplanation('default')} className="text-sm rounded-md px-3 py-1 bg-neutral-800 hover:bg-neutral-700">Default</button>
                  <button onClick={() => fetchExplanation('simplified')} className="text-sm rounded-md px-3 py-1 bg-neutral-800 hover:bg-neutral-700">Simplified</button>
                  <button onClick={() => fetchExplanation('detailed')} className="text-sm rounded-md px-3 py-1 bg-neutral-800 hover:bg-neutral-700">Detailed</button>
                  <button onClick={() => fetchExplanation('example')} className="text-sm rounded-md px-3 py-1 bg-neutral-800 hover:bg-neutral-700">Example</button>
                </div>
                <hr className="border-neutral-800 my-6" />
                <div className="prose prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{explanation}</ReactMarkdown>
                </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 md:p-8">
                <h3 className="text-2xl font-bold tracking-tight mb-6">Mastery Check</h3>
                <QuizPanel key={currentIndex} quiz={quiz} onPassed={unlockNext} activeTitle={currentSubtopic.title} />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center rounded-lg border-2 border-dashed border-neutral-800 text-neutral-500 min-h-[60vh]">
            <p>{loading ? 'Analyzing...' : 'Analyze some content to begin learning'}</p>
          </div>
        )}
      </main>

      {/* --- Right Column: AI Tutor (3/10 width) --- */}
      <aside className="lg:col-span-3 h-[calc(100vh-8rem)] self-start sticky top-24">
        <ChatPanel documentContent={content} />
      </aside>
    </div>
  );
}

function QuizPanel({ quiz, onPassed, activeTitle }: { quiz: any[], onPassed: () => void, activeTitle?: string }) {
  const [answers, setAnswers] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);
  const relevantQs = activeTitle ? quiz.filter(q => q.subtopicTitle && q.subtopicTitle.toLowerCase().includes(activeTitle.toLowerCase())) : [];
  const qs = relevantQs.length > 0 ? relevantQs : [];
  const setAns = (qIndex: number, ansIndex: number) => { const next = [...answers]; next[qIndex] = ansIndex; setAnswers(next); };
  const check = () => { setRevealed(true); const allCorrect = qs.every((q, i) => answers[i] === q.answerIndex); if (allCorrect) setTimeout(onPassed, 1200); };
  useEffect(() => { setAnswers([]); setRevealed(false); }, [activeTitle]);
  return (
    <div className="space-y-4">
      {qs.length === 0 ? <p className="text-neutral-400 text-sm">No quiz questions available for this subtopic.</p> :
      <ul className="space-y-6">
        {qs.map((q, i) => (
          <li key={q.prompt} className="space-y-3">
            <div className="font-medium text-neutral-200">{q.prompt}</div>
            <div className="grid gap-2">
              {q.options.map((o: string, j: number) => {
                const isSelected = answers[i] === j;
                const isCorrect = revealed && j === q.answerIndex;
                const isIncorrect = revealed && isSelected && j !== q.answerIndex;
                const buttonClass = `rounded-md border p-3 text-left transition-all text-sm ${ isCorrect ? 'border-green-500 bg-green-900/30' : isIncorrect ? 'border-red-500 bg-red-900/30' : isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-neutral-700 hover:bg-neutral-800' }`;
                return <button key={j} onClick={() => setAns(i, j)} className={buttonClass} disabled={revealed}>{o}</button>;
              })}
            </div>
            {revealed && q.explanation && <div className="text-sm text-neutral-400 pt-3 border-t border-neutral-800 mt-4">{q.explanation}</div>}
          </li>
        ))}
      </ul>}
      <div className="flex items-center gap-4 pt-4">
        <button onClick={check} disabled={revealed || qs.length === 0} className="rounded-md bg-white px-5 py-2 text-black font-semibold disabled:opacity-50">Check Answer</button>
      </div>
    </div>
  );
}
