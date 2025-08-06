'use client';

import { useState, useEffect } from 'react';
import { useLearnStore } from '@/lib/learn-store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// API call functions remain the same
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

export default function Learn() {
  const [input, setInput] = useState('');
  const {
    topic, subtopics, unlockedIndex, currentIndex, content, explanation, quiz, loading, error,
    setContent, setBreakdown, setExplanation, setQuiz, setLoading, setError, selectIndex, unlockNext, resetAll,
  } = useLearnStore();

  const currentSubtopic = subtopics[currentIndex];
  const isSubtopicActive = currentSubtopic != null;

  const analyzeContent = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(undefined);
    resetAll();
    setInput(text);
    setContent(text);
    setBreakdown('Analyzing…', []);

    try {
      const bd = await postJSON<{ topic: string; subtopics: any[] }>('/api/breakdown', { content: text });
      setBreakdown(bd.topic, bd.subtopics);
      const qz = await postJSON<{ questions: any[] }>('/api/quiz', { subtopics: bd.subtopics });
      setQuiz(qz.questions);
    } catch (e: any) {
      setError(e.message || 'Failed to analyze content.');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (currentSubtopic) {
      setExplanation('Generating explanation...');
      postJSON<{ explanation: string }>('/api/explain', { content, subtopicTitle: currentSubtopic.title })
        .then(res => setExplanation(res.explanation))
        .catch(e => setExplanation('Could not generate explanation. ' + e.message));
    }
  }, [currentIndex, content, currentSubtopic, setExplanation]);

  const handlePdfUpload = async (file: File) => {
    setLoading(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await postForm<{ content: string }>('/api/upload-pdf', form);
      await analyzeContent(res.content);
    } catch (e: any) {
      setError(e.message || 'Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-8">
      {/* Sidebar for topic navigation */}
      <aside className="rounded-lg border border-neutral-800 p-4 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Learn Workspace</h2>
          <p className="text-sm text-neutral-400 mt-1">Upload content to start a new topic.</p>
        </div>
        <textarea
            className="w-full min-h-[120px] rounded-md bg-neutral-900 p-3 outline-none ring-1 ring-neutral-700 focus:ring-white"
            placeholder="Paste lecture notes or drop a PDF here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer?.files?.[0]; if (file) handlePdfUpload(file); }}
        />
        <div className="flex flex-wrap gap-2">
            <button onClick={() => analyzeContent(input)} disabled={loading || !input.trim()} className="rounded-md bg-white px-4 py-2 text-black font-medium disabled:opacity-50">
                {loading ? 'Analyzing…' : 'Analyze'}
            </button>
            <button onClick={() => { resetAll(); setInput(''); }} className="rounded-md border border-neutral-700 px-4 py-2 text-neutral-200">Reset</button>
        </div>
        {error && (<div className="text-sm text-red-400" role="alert">{error}</div>)}
        <hr className="border-neutral-800" />
        <div>
            <div className="mb-3">
                <div className="text-sm uppercase tracking-wide text-neutral-400">Topic</div>
                <div className="font-semibold text-lg">{topic}</div>
            </div>
            {subtopics.length > 0 && (
                <ul className="space-y-2">
                    {subtopics.map((s, i) => (
                    <li key={i}>
                        <button onClick={() => selectIndex(i)} disabled={i > unlockedIndex} className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${i > unlockedIndex ? 'text-neutral-600 cursor-not-allowed' : i === currentIndex ? 'bg-neutral-800 text-white font-semibold' : 'text-neutral-300 hover:bg-neutral-900'}`}>
                            {i + 1}. {s.title}
                        </button>
                    </li>
                    ))}
                </ul>
            )}
        </div>
      </aside>

      {/* Main content area for the explanation and quiz */}
      <main>
        {isSubtopicActive ? (
          <div className="space-y-8">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 md:p-8">
                <h3 className="text-2xl font-bold tracking-tight">{currentSubtopic.title}</h3>
                <div className="text-sm text-neutral-400 mt-2">
                    Importance: {currentSubtopic.importance} • Difficulty: {currentSubtopic.difficulty}
                </div>
                <hr className="border-neutral-800 my-6" />
                <div className="prose prose-invert max-w-none 
prose-headings:font-bold prose-headings:tracking-tight 
prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-4 prose-h2:border-b prose-h2:border-neutral-800 
prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 
prose-p:leading-7 prose-p:text-neutral-300 
prose-strong:text-neutral-100 
prose-a:text-blue-400 prose-a:font-medium prose-a:no-underline hover:prose-a:underline 
prose-ul:list-disc prose-ul:pl-5 prose-li:my-2 
prose-ol:list-decimal prose-ol:pl-5 
prose-code:bg-neutral-800 prose-code:rounded prose-code:px-2 prose-code:py-1 prose-code:font-mono prose-code:text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {explanation}
                    </ReactMarkdown>
                </div>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 md:p-8">
                <h3 className="text-2xl font-bold tracking-tight mb-6">Mastery Check</h3>
                <QuizPanel key={currentIndex} quiz={quiz} onPassed={unlockNext} activeTitle={currentSubtopic.title} />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center rounded-lg border-2 border-dashed border-neutral-800 text-neutral-500">
            <p>Select a subtopic to begin learning</p>
          </div>
        )}
      </main>
    </div>
  );
}

// QuizPanel component remains unchanged
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
                const buttonClass = `rounded-md border p-3 text-left transition-all text-sm ${
                  isCorrect ? 'border-green-500 bg-green-900/30' :
                  isIncorrect ? 'border-red-500 bg-red-900/30' :
                  isSelected ? 'border-blue-500 bg-blue-900/20' :
                  'border-neutral-700 hover:bg-neutral-800'
                }`;
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
