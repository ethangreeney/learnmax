'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';


// Normalize to avoid whole-message fenced blocks.
function sanitizeMd(md: string): string {
  if (!md) return md;
  let t = md.trim();
  const exactFence = t.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
  if (exactFence) t = exactFence[1].trim();
  else {
    const m = t.match(/^```([A-Za-z0-9+_.-]*)\s*\n([\s\S]*?)\n```$/);
    if (m) {
      const lang = (m[1] || "").toLowerCase();
      const inner = m[2];
      if (lang === "" || lang === "markdown" || lang === "md" || /^(#{1,6}\s|[-*]\s|\d+\.\s)/m.test(inner) || /\n\n/.test(inner)) {
        t = inner.trim();
      }
    }
  }
  const lines = t.split("\n");
  const nonEmpty = lines.filter(l => l.trim() !== "");
  if (nonEmpty.length && nonEmpty.every(l => /^ {4,}|\t/.test(l))) {
    t = lines.map(l => l.replace(/^ {4}/, "")).join("\n").trim();
  }
  const ticks = (t.match(/```/g) || []).length;
  if (ticks === 1) t = t.replace(/```/g, "");
  return t;
}


type Message = {
  sender: 'user' | 'ai';
  text: string;
};

type ChatPanelProps = {
  documentContent: string;
};

async function postJSON<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed: ${res.status}`); }
  return res.json();
}

export default function ChatPanel({ documentContent }: ChatPanelProps) {
  const [history, setHistory] = useState<Message[]>([
    { sender: 'ai', text: "I'm your AI Tutor. Ask me anything about the content on the left!" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [history]);

  const autosize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 160; // px, ~5-6 lines
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  };
  useEffect(() => { autosize(); }, []);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !documentContent) {
        if (!documentContent) {
            setHistory(prev => [...prev, { sender: 'ai', text: 'Please analyze some content first before asking questions.'}]);
        }
        return;
    };

    const userMessage: Message = { sender: 'user', text: input };
    setHistory(prev => [...prev, userMessage]);
    setInput('');
    // reset height after clearing
    setTimeout(autosize, 0);
    setIsLoading(true);

    try {
      let model: string | undefined;
      try { model = localStorage.getItem('ai:model') || undefined; } catch {}
      const res = await postJSON<{ response: string; debug?: { model?: string; ms?: number } }>('/api/chat', {
        userQuestion: input,
        documentContent,
        model,
      });
      const aiMessage: Message = { sender: 'ai', text: sanitizeMd(res.response) };
      setHistory(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = { sender: 'ai', text: 'Sorry, I ran into an error. Please try again.' };
      setHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full card">
      <header className="flex items-center justify-between p-4 border-b border-neutral-800/80">
        <h3 className="font-semibold text-lg">AI Tutor</h3>
      </header>

      <div ref={scrollContainerRef} className="flex-1 p-4 space-y-4 overflow-y-auto">
        {history.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
            {msg.sender === 'ai' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center"><Bot className="w-5 h-5" /></div>}
            <div className={`max-w-xs md:max-w-md rounded-lg px-3 py-2 ${msg.sender === 'user' ? 'bg-[rgb(var(--accent))] text-black' : 'bg-neutral-800'}`}>
              {msg.sender === 'ai' ? (
                <div className="markdown chat-md text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.text}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              )}
            </div>
            {msg.sender === 'user' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center"><User className="w-5 h-5" /></div>}
          </div>
        ))}
        {isLoading && (
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center"><Bot className="w-5 h-5" /></div>
                <div className="max-w-xs md:max-w-md rounded-lg px-4 py-2 bg-neutral-800 flex items-center">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
            </div>
        )}
      </div>

      <footer className="p-4 border-t border-neutral-800">
        <div className="flex items-center gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={autosize}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            }}
            placeholder="Ask about the content..."
            className="input flex-1 pl-4 py-2 resize-none ring-1 ring-transparent focus:ring-[rgb(var(--accent))] bg-[rgba(var(--accent),0.12)] border border-[rgba(var(--accent),0.35)] placeholder:text-neutral-400"
            rows={1}
            style={{ minHeight: 44, maxHeight: 160, overflowY: 'auto' }}
            disabled={isLoading || !documentContent}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim() || !documentContent}
            className="rounded-md bg-[rgb(var(--accent))] text-black disabled:opacity-50 h-[44px] w-[44px] md:h-[48px] md:w-[48px] flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
