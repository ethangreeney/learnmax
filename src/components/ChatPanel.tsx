'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Send, Loader2, User, Bot, Maximize2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import useBodyScrollLock from '@/hooks/useBodyScrollLock';
import useFocusTrap from '@/hooks/useFocusTrap';

// Normalize to avoid whole-message fenced blocks.
function sanitizeMd(md: string): string {
  if (!md) return md;
  let t = md.trim();
  const exactFence = t.match(/^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```$/i);
  if (exactFence) t = exactFence[1].trim();
  else {
    const m = t.match(/^```([A-Za-z0-9+_.-]*)\s*\n([\s\S]*?)\n```$/);
    if (m) {
      const lang = (m[1] || '').toLowerCase();
      const inner = m[2];
      if (
        lang === '' ||
        lang === 'markdown' ||
        lang === 'md' ||
        /^(#{1,6}\s|[-*]\s|\d+\.\s)/m.test(inner) ||
        /\n\n/.test(inner)
      ) {
        t = inner.trim();
      }
    }
  }
  const lines = t.split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  if (nonEmpty.length && nonEmpty.every((l) => /^ {4,}|\t/.test(l))) {
    t = lines
      .map((l) => l.replace(/^ {4}/, ''))
      .join('\n')
      .trim();
  }
  const ticks = (t.match(/```/g) || []).length;
  if (ticks === 1) t = t.replace(/```/g, '');
  return t;
}

// Merge streamed chat chunks robustly (handles cumulative streams & avoids word gluing)
function mergeChatChunk(previous: string, incoming: string): string {
  if (!previous) return incoming;
  if (!incoming) return previous;
  const tail = previous.slice(Math.max(0, previous.length - 4096));
  const maxOverlap = Math.min(tail.length, incoming.length);
  let overlap = 0;
  for (let k = maxOverlap; k > 0; k--) {
    if (tail.endsWith(incoming.slice(0, k))) {
      overlap = k;
      break;
    }
  }
  const novel = incoming.slice(overlap);
  // Avoid concatenating words across boundary
  const needsSpace =
    /[A-Za-z0-9]$/.test(previous) && /^[A-Za-z0-9]/.test(novel);
  return needsSpace ? previous + ' ' + novel : previous + novel;
}

type Message = {
  sender: 'user' | 'ai';
  text: string;
};

type ChatPanelProps = {
  documentContent: string;
  lectureId?: string; // for persistence scope
  intro?: string;
  demoMode?: boolean;
};

async function postJSON<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export default function ChatPanel({
  documentContent,
  lectureId,
  intro,
  demoMode,
}: ChatPanelProps) {
  const [history, setHistory] = useState<Message[]>([
    {
      sender: 'ai',
      text:
        intro ||
        "I'm your AI Tutor. Ask me anything about the content on the left!",
    },
  ]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [supportsStreaming, setSupportsStreaming] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [overlayReady, setOverlayReady] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inlineRef = useRef<HTMLDivElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  const preservedScrollRef = useRef<number>(0);
  const [portalEl, setPortalEl] = useState<Element | null>(null);

  useEffect(() => {
    setPortalEl(typeof document !== 'undefined' ? document.body : null);
  }, []);

  // Accessibility: focus lock and body scroll lock while expanded
  const showOverlay = expanded || animating;
  useBodyScrollLock(showOverlay);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, showOverlay, {
    focusOnActivate: true,
  });

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }, [history]);

  // Load persisted chat history scoped to lecture
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lectureId || demoMode) return;
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const res = await fetch(`/api/chat/history?lectureId=${encodeURIComponent(lectureId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          messages?: Array<{ role: 'user' | 'ai'; text: string }>;
        };
        if (cancelled) return;
        const msgs = Array.isArray(data?.messages)
          ? data.messages.map((m) => ({ sender: m.role, text: m.text }))
          : [];
        if (msgs.length > 0) setHistory(msgs);
        else
          setHistory([
            {
              sender: 'ai',
              text:
                intro ||
                "I'm your AI Tutor. Ask me anything about the content on the left!",
            },
          ]);
      } catch (e: any) {
        if (!cancelled) setHistoryError(e?.message || 'Failed to load chat');
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId, demoMode]);

  // Handle Esc to close
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeExpanded();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [expanded]);

  const track = useCallback(
    (event: 'tutor_expand_opened' | 'tutor_expand_closed') => {
      try {
        const vw = Math.round(window.innerWidth);
        const vh = Math.round(window.innerHeight);
        const device = vw < 768 ? 'mobile' : vw < 1024 ? 'tablet' : 'desktop';
        const payload = JSON.stringify({
          event,
          viewport: { w: vw, h: vh },
          device,
        });
        const url = '/api/telemetry';
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } else {
          void fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });
        }
      } catch {}
    },
    []
  );

  const measureRect = (el: HTMLElement | null) => {
    if (!el) return null as null | DOMRect;
    try {
      return el.getBoundingClientRect();
    } catch {
      return null;
    }
  };

  const animateOpen = () => {
    const from = measureRect(inlineRef.current);
    const panel = modalRef.current;
    const to = measureRect(panel);
    if (!from || !to || !panel) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = Math.max(0.01, from.width / Math.max(1, to.width));
    const sy = Math.max(0.01, from.height / Math.max(1, to.height));
    panel.style.transformOrigin = 'top left';
    panel.style.willChange = 'transform, opacity';
    panel.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
    panel.style.opacity = '0.4';
    requestAnimationFrame(() => {
      panel.style.transition = 'transform 200ms ease, opacity 200ms ease';
      panel.style.transform = 'translate3d(0,0,0) scale(1,1)';
      panel.style.opacity = '1';
      setTimeout(() => {
        panel.style.transition = '';
        panel.style.willChange = '';
      }, 210);
    });
  };

  const animateClose = () => {
    const panel = modalRef.current;
    const to = measureRect(inlineRef.current);
    const from = measureRect(panel);
    if (!panel || !from || !to) return;
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const sx = Math.max(0.01, to.width / Math.max(1, from.width));
    const sy = Math.max(0.01, to.height / Math.max(1, from.height));
    panel.style.transformOrigin = 'top left';
    panel.style.willChange = 'transform, opacity';
    panel.style.transition = 'transform 200ms ease, opacity 200ms ease';
    requestAnimationFrame(() => {
      panel.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
      panel.style.opacity = '0.4';
      setTimeout(() => {
        panel.style.transition = '';
        panel.style.willChange = '';
      }, 210);
    });
  };

  const openExpanded = () => {
    if (expanded) return;
    // Preserve scroll position to restore after transition
    const sc = scrollContainerRef.current;
    preservedScrollRef.current = sc ? sc.scrollTop : 0;
    setAnimating(true);
    setExpanded(true);
    setOverlayReady(false);
    track('tutor_expand_opened');
    // Arm overlay for CSS transition next frame
    requestAnimationFrame(() => setOverlayReady(true));
    // End anim marker after animation
    setTimeout(() => setAnimating(false), 210);
    // Restore scroll after render
    setTimeout(() => {
      try {
        if (scrollContainerRef.current)
          scrollContainerRef.current.scrollTop = preservedScrollRef.current;
      } catch {}
      // Perform FLIP animation after modal is laid out
      try {
        animateOpen();
      } catch {}
    }, 0);
  };

  const closeExpanded = () => {
    if (!expanded) return;
    // Preserve scroll before collapsing
    const sc = scrollContainerRef.current;
    preservedScrollRef.current = sc ? sc.scrollTop : 0;
    setAnimating(true);
    setOverlayReady(false);
    // Animate towards inline card before removing overlay
    try {
      animateClose();
    } catch {}
    setExpanded(false);
    track('tutor_expand_closed');
    setTimeout(() => setAnimating(false), 210);
    // Restore focus to the trigger
    setTimeout(() => {
      try {
        expandBtnRef.current?.focus();
      } catch {}
    }, 0);
    // Restore scroll after returning to inline layout
    setTimeout(() => {
      try {
        if (scrollContainerRef.current)
          scrollContainerRef.current.scrollTop = preservedScrollRef.current;
      } catch {}
    }, 0);
  };

  const autosize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 160; // px, ~5-6 lines
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  };
  useEffect(() => {
    autosize();
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || !documentContent) {
      if (!documentContent) {
        setHistory((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: 'Please analyze some content first before asking questions.',
          },
        ]);
      }
      return;
    }

    const userMessage: Message = { sender: 'user', text: input };
    setHistory((prev) => [...prev, userMessage]);
    setInput('');
    // reset height after clearing
    setTimeout(autosize, 0);
    setIsLoading(true);

    try {
      let model: string | undefined;
      try {
        model = localStorage.getItem('ai:model') || undefined;
      } catch {}

      if (supportsStreaming) {
        const qs = new URLSearchParams({ stream: '1' });
        const res = await fetch('/api/chat?' + qs.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userQuestion: userMessage.text,
            documentContent,
            model,
            demoMode: Boolean(demoMode),
            lectureId,
          }),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        // Add an empty AI message we will append to
        let aiIndex = -1;
        setHistory((prev) => {
          aiIndex = prev.length;
          return [...prev, { sender: 'ai', text: '' }];
        });

        const reader = (res.body as ReadableStream<Uint8Array>)?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const yieldFrame = () =>
          new Promise<void>((r) => {
            if (typeof requestAnimationFrame !== 'undefined')
              requestAnimationFrame(() => r());
            else setTimeout(r, 0);
          });
        if (!reader) throw new Error('No stream reader');
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const event = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 2);
            if (!event.startsWith('data:')) continue;
            const json = event.slice(5).trim();
            let payload: any;
            try {
              payload = JSON.parse(json);
            } catch {
              continue;
            }
            if (
              payload?.type === 'chunk' &&
              typeof payload.delta === 'string'
            ) {
              const delta = payload.delta;
              setHistory((prev) => {
                const copy = prev.slice();
                const i = aiIndex >= 0 ? aiIndex : copy.length - 1;
                const current = copy[i];
                copy[i] = {
                  ...current,
                  text: mergeChatChunk(current?.text || '', delta),
                };
                return copy;
              });
              await yieldFrame();
            } else if (payload?.type === 'done') {
              // sanitize the aggregated message at completion
              setHistory((prev) => {
                const copy = prev.slice();
                const i = aiIndex >= 0 ? aiIndex : copy.length - 1;
                copy[i] = {
                  ...copy[i],
                  text: sanitizeMd(copy[i].text),
                };
                return copy;
              });
            } else if (payload?.type === 'error') {
              throw new Error(payload.error || 'stream error');
            }
          }
        }
      } else {
        const res = await postJSON<{
          response: string;
          debug?: { model?: string; ms?: number };
        }>('/api/chat', {
          userQuestion: userMessage.text,
          documentContent,
          model,
          demoMode: Boolean(demoMode),
          lectureId,
        });
        const aiMessage: Message = {
          sender: 'ai',
          text: sanitizeMd(res.response),
        };
        setHistory((prev) => [...prev, aiMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        sender: 'ai',
        text: 'Sorry, I ran into an error. Please try again.',
      };
      setHistory((prev) => [...prev, errorMessage]);
      // If streaming failed once, fallback next time
      setSupportsStreaming(false);
    } finally {
      setIsLoading(false);
    }
  };

  const titleId = 'ai-tutor-title';

  const handleClear = async () => {
    try {
      if (!lectureId || demoMode) {
        setHistory([
          {
            sender: 'ai',
            text:
              intro ||
              "I'm your AI Tutor. Ask me anything about the content on the left!",
          },
        ]);
        return;
      }
      const ok = typeof window !== 'undefined'
        ? window.confirm('Clear chat history for this lesson?')
        : true;
      if (!ok) return;
      const res = await fetch('/api/chat/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHistory([
        {
          sender: 'ai',
          text:
            intro ||
            "I'm your AI Tutor. Ask me anything about the content on the left!",
        },
      ]);
    } catch {}
  };

  const panelContent = (
    <>
      <header className="flex items-center justify-between border-b border-neutral-800/80 p-4">
        <h3 id={titleId} className="text-lg font-semibold">
          AI Tutor
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            aria-label="Clear chat"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
          >
            Clear
          </button>
          {!expanded && (
            <button
              ref={expandBtnRef}
              onClick={openExpanded}
              aria-expanded={expanded}
              aria-label="Expand AI Tutor"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
            >
              <Maximize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Expand</span>
            </button>
          )}
          {expanded && (
            <button
              onClick={closeExpanded}
              aria-label="Close"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Close</span>
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollContainerRef}
        className={`${expanded ? 'flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6' : 'flex-1 space-y-4 overflow-y-auto p-4'}`}
      >
        {loadingHistory && (
          <div className="text-xs text-neutral-400">Loading conversation…</div>
        )}
        {!loadingHistory && historyError && (
          <div className="text-xs text-yellow-400">Could not load previous messages.</div>
        )}
        {history.map((msg, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}
          >
            {msg.sender === 'ai' && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
                <Bot className="h-5 w-5" />
              </div>
            )}
            <div
              className={`${
                expanded
                  ? msg.sender === 'ai'
                    ? 'w-full max-w-[80ch] rounded-lg bg-neutral-800 px-4 py-3'
                    : 'max-w-[60ch] rounded-lg bg-[rgb(var(--accent))] px-3 py-2 text-black'
                  : 'max-w-xs rounded-lg px-3 py-2 md:max-w-md ' +
                    (msg.sender === 'user'
                      ? 'bg-[rgb(var(--accent))] text-black'
                      : 'bg-neutral-800')
              }`}
            >
              {msg.sender === 'ai' ? (
                <div
                  className={`markdown chat-md ${expanded ? 'text-base sm:text-[0.95rem]' : 'text-sm'}`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              )}
            </div>
            {msg.sender === 'user' && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
                <User className="h-5 w-5" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex max-w-xs items-center rounded-lg bg-neutral-800 px-4 py-2 md:max-w-md">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          </div>
        )}
      </div>

      <footer
        className={`${expanded ? 'border-t border-neutral-800 bg-transparent px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6' : 'border-t border-neutral-800 p-4'}`}
      >
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
            className={`input flex-1 resize-none border border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.12)] py-2 pl-4 ring-1 ring-transparent placeholder:text-neutral-400 focus:ring-[rgb(var(--accent))] ${expanded ? 'mx-auto max-w-[80ch]' : ''}`}
            rows={1}
            style={{ minHeight: 44, maxHeight: 160, overflowY: 'auto' }}
            disabled={isLoading || !documentContent}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim() || !documentContent}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-[rgb(var(--accent))] text-black disabled:opacity-50 md:h-[48px] md:w-[48px]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </>
  );

  return (
    <>
      {/* Inline panel (placeholder during expanded) */}
      <div
        className={`card flex h-full flex-col ${expanded ? 'invisible' : ''}`}
        aria-labelledby={titleId}
      >
        {panelContent}
      </div>

      {/* Overlay modal through portal to avoid layout shift; also animate */}
      {portalEl &&
        showOverlay &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <button
              aria-label="Close expanded tutor"
              onClick={closeExpanded}
              className={`absolute inset-0 transition-opacity duration-250 ${overlayReady ? 'opacity-100' : 'opacity-0'} bg-black/50 backdrop-blur-[2px]`}
              tabIndex={-1}
            />
            {/* Modal panel */}
            <div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={`relative mx-4 w-full origin-top-right ${
                // On small screens, full-screen modal; desktop centered with max size
                'sm:mx-6'
              } ${overlayReady ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'} transition-[transform,opacity] duration-200 ease-out`}
              style={{ maxWidth: '1000px' }}
            >
              <div
                className={`flex h-[min(92vh,calc(100vh-4rem))] flex-col rounded-xl border border-neutral-800 bg-[rgba(10,10,10,0.92)] shadow-2xl sm:mx-auto sm:h-[min(90vh,calc(100vh-6rem))]`}
              >
                {panelContent}
              </div>
            </div>
          </div>,
          portalEl
        )}
    </>
  );
}
