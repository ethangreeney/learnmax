'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [history]);

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
    setIsLoading(true);

    try {
      const res = await postJSON<{ response: string }>('/api/chat', {
        userQuestion: input,
        documentContent,
      });
      const aiMessage: Message = { sender: 'ai', text: res.response };
      setHistory(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: Message = { sender: 'ai', text: 'Sorry, I ran into an error. Please try again.' };
      setHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg border border-neutral-800 bg-neutral-900/50">
      <header className="flex items-center justify-between p-4 border-b border-neutral-800">
        <h3 className="font-semibold text-lg">AI Tutor</h3>
      </header>

      <div ref={scrollContainerRef} className="flex-1 p-4 space-y-6 overflow-y-auto">
        {history.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
            {msg.sender === 'ai' && <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center"><Bot className="w-5 h-5" /></div>}
            <div className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-neutral-800'}`}>
              {msg.sender === 'ai' ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            }}
            placeholder="Ask about the content..."
            className="w-full rounded-md bg-neutral-800 pr-12 pl-4 py-2 resize-none ring-1 ring-transparent focus:ring-blue-500 outline-none"
            rows={1}
            disabled={isLoading || !documentContent}
          />
          <button onClick={handleSendMessage} disabled={isLoading || !input.trim() || !documentContent} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-blue-600 text-white disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}
