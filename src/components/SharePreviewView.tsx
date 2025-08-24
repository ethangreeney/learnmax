'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import useFocusTrap from '@/hooks/useFocusTrap';
import ChatPanel from '@/components/ChatPanel';
import { Download } from 'lucide-react';

type PreviewQuestion = { prompt: string; options: string[] };
type PreviewSubtopic = { order: number; title: string; overview: string; explanation?: string; questions: PreviewQuestion[]; shortPrompt?: string };
type PreviewData = { title: string; author: string; subtopics: PreviewSubtopic[] };

export default function SharePreviewView({ token, data, isSignedIn, onImport }: { token: string; data: PreviewData; isSignedIn: boolean; onImport: (fd: FormData) => Promise<void> }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef, modalOpen, { focusOnActivate: true });

  // Scope global spacing adjustments to this page only
  useEffect(() => {
    const prev = document.body.getAttribute('data-page');
    document.body.setAttribute('data-page', 'shared-preview');
    return () => {
      if (prev) document.body.setAttribute('data-page', prev);
      else document.body.removeAttribute('data-page');
    };
  }, []);

  const sorted = useMemo(() => [...data.subtopics].sort((a, b) => a.order - b.order), [data.subtopics]);
  const current = sorted[currentIndex] || sorted[0];

  const openGate = () => setModalOpen(true);

  return (
    <div className="container-wide pt-2 pb-6">
      <div className="mx-auto">
        <div className="mb-4 grid grid-cols-1 items-start gap-2 px-2 md:px-4 lg:grid-cols-12">
          <div className="lg:col-span-9">
            <div className="text-sm text-neutral-400">Shared lesson by {data.author}</div>
            <h1 className="text-3xl font-bold tracking-tight">{data.title}</h1>
          </div>
          <div className="lg:col-span-3 flex justify-end">
            <form action={onImport} className="mt-3">
              <input type="hidden" name="s" value={String(current?.order ?? 0)} />
              <ImportCta />
            </form>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 px-2 md:px-4 lg:grid-cols-12 lg:gap-10 xl:gap-12">
          <aside className="space-y-2 self-start rounded-lg border border-neutral-800 p-6 lg:col-span-3">
            <h2 className="text-xl font-semibold">Outline</h2>
            <ul className="mt-2 space-y-1">
              {sorted.map((s, i) => (
                <li key={`${s.order}:${s.title}`}>
                  <button
                    onClick={() => setCurrentIndex(i)}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${i === currentIndex ? 'bg-neutral-800 font-semibold' : 'hover:bg-neutral-900'}`}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="lg:col-span-6">
            <div className="card p-6 md:p-8">
              <h3 className="text-2xl font-bold tracking-tight">{current.title}</h3>
              <div className="mt-2 text-sm text-neutral-400">
                <span>Preview mode</span>
              </div>
              <div className="markdown mt-4">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {current.explanation || current.overview || ''}
                </ReactMarkdown>
              </div>
            </div>

            <div className="quiz-panel card mt-8 p-6 md:p-8">
              <h3 className="mb-4 text-2xl font-bold tracking-tight">Questions</h3>
              {current.shortPrompt && (
                <div className="mb-6">
                  <div className="chat-md font-medium text-neutral-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {current.shortPrompt}
                    </ReactMarkdown>
                  </div>
                  <textarea
                    className="mt-2 w-full cursor-not-allowed rounded-md border border-neutral-700 bg-neutral-900 p-3 text-sm opacity-70"
                    rows={4}
                    placeholder="Import to submit"
                    aria-disabled
                    disabled
                  />
                </div>
              )}
              {(current.questions || []).length > 0 && (
                <div className="space-y-6">
                  {current.questions.map((q, idx) => (
                    <div key={`${idx}:${q.prompt}`} className="space-y-3">
                      <div className="chat-md font-medium text-neutral-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {q.prompt}
                        </ReactMarkdown>
                      </div>
                      <div className="grid gap-2">
                        {q.options.map((o, j) => (
                          <button
                            key={j}
                            onClick={() => openGate()}
                            aria-disabled
                            disabled
                            title="Import to answer"
                            className="cursor-not-allowed rounded-md border border-neutral-700 bg-neutral-900 p-3 text-left text-sm opacity-70"
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="pt-2">
                    <button
                      onClick={() => openGate()}
                      aria-disabled
                      disabled
                      className="cursor-not-allowed rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black opacity-70"
                    >
                      Check Answer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>

          <aside className="sticky top-24 h-[calc(100vh-8rem)] self-start lg:col-span-3">
            <ChatPanel
              documentContent={current.explanation || current.overview || ''}
              demoMode
              inputDisabled
              inputPlaceholder="AI tutor is disabled in preview"
            />
          </aside>
        </div>
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div ref={modalRef} className="w-full max-w-sm rounded-md border border-neutral-700 bg-neutral-900 p-4 text-neutral-200 shadow-xl">
            <h3 className="text-lg font-semibold">Import to answer</h3>
            <p className="mt-2 text-sm text-neutral-400">Add this lesson to your library to submit answers.</p>
            <form action={onImport} className="mt-4 flex items-center justify-end gap-2">
              <input type="hidden" name="s" value={String(current?.order ?? 0)} />
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
              >
                Cancel
              </button>
              <ImportCta small />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportCta({ small = false }: { small?: boolean }) {
  const { pending } = useFormStatus();
  const className = small
    ? 'inline-flex items-center justify-center rounded-md bg-[rgb(var(--accent))] px-4 py-1.5 text-sm font-semibold text-black shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center justify-center rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? (
        'Importing…'
      ) : (
        <span className="inline-flex items-center gap-2">
          <Download className={small ? 'h-4 w-4' : 'h-4 w-4'} />
          <span>Import lesson</span>
        </span>
      )}
    </button>
  );
}



