'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  Loader2,
  User,
  Bot,
  Maximize2,
  X,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
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

  // Clean up any legacy leaked mask placeholders
  t = t
    .replace(/&lt;&lt;MD_MASK_\d+&gt;&gt;/g, '')
    .replace(/<<MD_MASK_\d+>>/g, '');
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
  // Escape stray angle brackets outside code/math to prevent HTML stripping
  try {
    const masks: string[] = [];
    const mask = (m: string) => {
      masks.push(m);
      return `%%MDMASK:${masks.length - 1}%%`;
    };
    t = t.replace(/```[\s\S]*?```/g, mask);
    t = t.replace(/\$\$[\s\S]*?\$\$/g, mask);
    t = t.replace(/`[^`]*`/g, mask);
    t = t.replace(/(?<!\$)\$([^$\n]|[^$\n][\s\S]*?[^$\n])\$(?!\$)/g, mask);
    t = t.replace(/\\\([\s\S]*?\\\)/g, mask).replace(/\\\[[\s\S]*?\\\]/g, mask);
    t = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    t = t.replace(/%%MDMASK:(\d+)%%/g, (_, i) => masks[Number(i)] || '');
  } catch {}
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
  inputDisabled?: boolean;
  inputPlaceholder?: string;
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
  inputDisabled,
  inputPlaceholder,
}: ChatPanelProps) {
  const defaultIntro =
    "I'm grounded in this lesson. Ask me to explain, compare, or test any idea.";
  const [history, setHistory] = useState<Message[]>([
    {
      sender: 'ai',
      text: intro || defaultIntro,
    },
  ]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
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
  const [isHistoryLoaded, setIsHistoryLoaded] = useState<boolean>(false);

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
    if (scrollContainer && !loadingHistory) {
      // Only auto-scroll to bottom if we're not loading history
      // and if we haven't preserved a scroll position
      if (preservedScrollRef.current === 0) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [history, loadingHistory]);

  // Load persisted chat history scoped to lecture
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lectureId || demoMode) {
        // For demo mode or no lectureId, consider history as loaded immediately
        setIsHistoryLoaded(true);
        return;
      }
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const res = await fetch(
          `/api/chat/history?lectureId=${encodeURIComponent(lectureId)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          messages?: Array<{ role: string; text: string }>;
        };
        if (cancelled) return;
        const msgs = Array.isArray(data?.messages)
          ? data.messages
              .filter((m) => m && (m.role === 'user' || m.role === 'ai'))
              .map((m) => ({ sender: m.role as 'user' | 'ai', text: m.text }))
          : [];
        if (msgs.length > 0) setHistory(msgs);
        else
          setHistory([
            {
              sender: 'ai',
              text: intro || defaultIntro,
            },
          ]);
        // Mark history as loaded and restore preserved scroll position
        setIsHistoryLoaded(true);
        setTimeout(() => {
          const scrollContainer = scrollContainerRef.current;
          if (scrollContainer && preservedScrollRef.current > 0) {
            scrollContainer.scrollTop = preservedScrollRef.current;
          }
        }, 0);
      } catch (e: any) {
        if (!cancelled) setHistoryError(e?.message || 'Failed to load chat');
      } finally {
        if (!cancelled) {
          setLoadingHistory(false);
          setIsHistoryLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId, demoMode]);

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
        if (scrollContainerRef.current) {
          // Only restore scroll position if we have a preserved position and history is loaded
          if (preservedScrollRef.current > 0 && isHistoryLoaded) {
            scrollContainerRef.current.scrollTop = preservedScrollRef.current;
          } else {
            // Scroll to bottom for new messages or initial state
            scrollContainerRef.current.scrollTop =
              scrollContainerRef.current.scrollHeight;
          }
        }
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
        if (scrollContainerRef.current && preservedScrollRef.current > 0) {
          scrollContainerRef.current.scrollTop = preservedScrollRef.current;
        }
      } catch {}
    }, 0);
  };

  // Escape always returns focus to the inline trigger through closeExpanded.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExpanded();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // closeExpanded intentionally reflects the current render while the dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

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

  const handleSendMessage = async (questionOverride?: string) => {
    const question = String(questionOverride ?? input).trim();
    if (!question || isLoading || !documentContent) {
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

    const userMessage: Message = { sender: 'user', text: question };
    setHistory((prev) => [...prev, userMessage]);
    // Reset preserved scroll position when sending new message so it scrolls to bottom
    preservedScrollRef.current = 0;
    setInput('');
    setFailedQuestion(null);
    // reset height after clearing
    setTimeout(autosize, 0);
    setIsLoading(true);
    let addedStreamingResponse = false;

    try {
      if (supportsStreaming) {
        const qs = new URLSearchParams({ stream: '1' });
        const res = await fetch('/api/chat?' + qs.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userQuestion: userMessage.text,
            documentContent,
            demoMode: Boolean(demoMode),
            lectureId,
          }),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);

        // Add an empty AI message we will append to
        let aiIndex = -1;
        addedStreamingResponse = true;
        setHistory((prev) => {
          aiIndex = prev.length;
          return [...prev, { sender: 'ai', text: '' }];
        });

        const reader = (res.body as ReadableStream<Uint8Array>)?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedStreamText = false;
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
              if (delta.trim()) receivedStreamText = true;
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
              // Reset preserved scroll position for completed AI responses so it stays at bottom
              preservedScrollRef.current = 0;
            } else if (payload?.type === 'error') {
              throw new Error(payload.error || 'stream error');
            }
          }
        }
        if (!receivedStreamText)
          throw new Error('The tutor returned no answer');
      } else {
        const res = await postJSON<{
          response: string;
          debug?: { model?: string; ms?: number };
        }>('/api/chat', {
          userQuestion: userMessage.text,
          documentContent,
          demoMode: Boolean(demoMode),
          lectureId,
        });
        const aiMessage: Message = {
          sender: 'ai',
          text: sanitizeMd(res.response),
        };
        setHistory((prev) => [...prev, aiMessage]);
        // Reset preserved scroll position for AI responses so it scrolls to bottom
        preservedScrollRef.current = 0;
      }
    } catch {
      const errorMessage: Message = {
        sender: 'ai',
        text: "I couldn't answer that just now. Your question is safe below so you can retry.",
      };
      setHistory((prev) => {
        const next = prev.slice();
        while (
          addedStreamingResponse &&
          next.length > 0 &&
          next[next.length - 1]?.sender === 'ai'
        ) {
          next.pop();
        }
        while (
          next.length > 0 &&
          next[next.length - 1]?.sender === 'ai' &&
          !next[next.length - 1]?.text.trim()
        ) {
          next.pop();
        }
        return [...next, errorMessage];
      });
      setFailedQuestion(userMessage.text);
      // Reset preserved scroll position for error messages so it scrolls to bottom
      preservedScrollRef.current = 0;
      // If streaming failed once, fallback next time
      setSupportsStreaming(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      if (!lectureId || demoMode) {
        setHistory([
          {
            sender: 'ai',
            text: intro || defaultIntro,
          },
        ]);
        setFailedQuestion(null);
        setHistoryError(null);
        return;
      }
      const ok =
        typeof window !== 'undefined'
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
          text: intro || defaultIntro,
        },
      ]);
      // Reset preserved scroll position when clearing chat
      preservedScrollRef.current = 0;
      setIsHistoryLoaded(true);
      setFailedQuestion(null);
      setHistoryError(null);
    } catch {
      setHistoryError('Could not clear this conversation. Please try again.');
    }
  };

  const starterPrompts = [
    'Explain this section simply',
    'Give me a concrete example',
    'Quiz me with one question',
  ];

  const renderPanelContent = (surface: 'inline' | 'expanded') => {
    const isExpandedSurface = surface === 'expanded';
    const surfaceTitleId = `ai-tutor-title-${surface}`;
    const canClear =
      history.some((message) => message.sender === 'user') && !isLoading;

    return (
      <>
        <header className="flex items-center justify-between border-b border-neutral-800/80 p-4">
          <div className="min-w-0">
            <h3 id={surfaceTitleId} className="text-lg font-semibold">
              AI Tutor
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              Grounded in this section
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              aria-label="Clear chat"
              disabled={!canClear}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
            {!isExpandedSurface && (
              <button
                ref={expandBtnRef}
                onClick={openExpanded}
                aria-expanded={expanded}
                aria-label="Expand AI Tutor"
                className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Expand</span>
              </button>
            )}
            {isExpandedSurface && (
              <button
                onClick={closeExpanded}
                aria-label="Close"
                className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Close</span>
              </button>
            )}
          </div>
        </header>

        <div
          ref={scrollContainerRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="AI Tutor conversation"
          className={`${isExpandedSurface ? 'flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6' : 'flex-1 space-y-4 overflow-y-auto p-4'}`}
        >
          {loadingHistory && (
            <div
              className="flex items-center gap-2 text-xs text-neutral-400"
              role="status"
            >
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              Loading conversation…
            </div>
          )}
          {!loadingHistory && historyError && (
            <div
              className="rounded-md border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200"
              role="alert"
            >
              {historyError.startsWith('Could not clear')
                ? historyError
                : 'Previous messages could not be loaded. You can still start a new conversation.'}
            </div>
          )}
          {history.map((msg, index) => {
            if (msg.sender === 'ai' && !msg.text.trim()) return null;
            return (
              <div
                key={index}
                className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}
              >
                {msg.sender === 'ai' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
                    <Bot className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
                <div
                  className={`min-w-0 break-words ${
                    isExpandedSurface
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
                      className={`markdown chat-md ${isExpandedSurface ? 'text-base sm:text-[0.95rem]' : 'text-sm'}`}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  )}
                </div>
                {msg.sender === 'user' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })}
          {!loadingHistory &&
            history.length === 1 &&
            history[0]?.sender === 'ai' &&
            !isLoading &&
            documentContent && (
              <div className="space-y-2 pt-1" aria-label="Suggested questions">
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Try asking
                </div>
                <div className="flex flex-wrap gap-2">
                  {starterPrompts.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void handleSendMessage(suggestion)}
                      className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:bg-neutral-800 hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          {isLoading && (
            <div
              className="flex items-start gap-3"
              role="status"
              aria-label="AI Tutor is thinking"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700">
                <Bot className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex max-w-xs items-center gap-2 rounded-lg bg-neutral-800 px-4 py-2 text-xs text-neutral-400 md:max-w-md">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Thinking…
              </div>
            </div>
          )}
          {failedQuestion && !isLoading && (
            <button
              type="button"
              onClick={() => void handleSendMessage(failedQuestion)}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry last question
            </button>
          )}
        </div>

        <footer
          className={`${isExpandedSurface ? 'border-t border-neutral-800 bg-transparent px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6' : 'border-t border-neutral-800 p-4'}`}
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
                  void handleSendMessage();
                }
              }}
              placeholder={
                inputDisabled && inputPlaceholder
                  ? inputPlaceholder
                  : inputPlaceholder ||
                    (!documentContent
                      ? 'Tutor will be ready when this section finishes loading'
                      : 'Ask about this section…')
              }
              aria-label="Ask the AI Tutor"
              title="Press Enter to send. Press Shift and Enter for a new line."
              className={`input flex-1 resize-none border border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.12)] py-2 pl-4 ring-1 ring-transparent placeholder:text-neutral-400 focus:ring-[rgb(var(--accent))] ${isExpandedSurface ? 'mx-auto max-w-[80ch]' : ''} ${isLoading || !documentContent || inputDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
              rows={1}
              style={{ minHeight: 44, maxHeight: 160, overflowY: 'auto' }}
              disabled={isLoading || !documentContent || Boolean(inputDisabled)}
            />
            <button
              onClick={() => void handleSendMessage()}
              aria-label="Send message"
              disabled={
                isLoading ||
                !input.trim() ||
                !documentContent ||
                Boolean(inputDisabled)
              }
              className="flex h-[44px] w-[44px] items-center justify-center rounded-md bg-[rgb(var(--accent))] text-black disabled:opacity-50 md:h-[48px] md:w-[48px]"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </footer>
      </>
    );
  };

  return (
    <>
      {/* Inline panel (placeholder during expanded) */}
      <div
        className={`card flex h-full flex-col ${expanded ? 'invisible' : ''}`}
        aria-labelledby="ai-tutor-title-inline"
        aria-hidden={expanded ? true : undefined}
      >
        {renderPanelContent('inline')}
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
              aria-labelledby="ai-tutor-title-expanded"
              className={`relative mx-4 w-full origin-top-right ${
                // On small screens, full-screen modal; desktop centered with max size
                'sm:mx-6'
              } ${overlayReady ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'} transition-[transform,opacity] duration-200 ease-out`}
              style={{ maxWidth: '1000px' }}
            >
              <div
                className={`flex h-[min(92vh,calc(100vh-4rem))] flex-col rounded-xl border border-neutral-800 bg-[rgba(10,10,10,0.92)] shadow-2xl sm:mx-auto sm:h-[min(90vh,calc(100vh-6rem))]`}
              >
                {renderPanelContent('expanded')}
              </div>
            </div>
          </div>,
          portalEl
        )}
    </>
  );
}
