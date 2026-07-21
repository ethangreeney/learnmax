'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  Loader2,
  Maximize2,
  X,
  RotateCcw,
  BookOpen,
  Brain,
  Check,
  Lightbulb,
  MessageCircle,
  ShieldCheck,
  Trash2,
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
    'Use me as a guide through this section. I can clarify the idea, make it concrete, or check what you remember.';
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

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animateOpen = () => {
    const from = measureRect(inlineRef.current);
    const panel = modalRef.current;
    const to = measureRect(panel);
    if (!from || !to || !panel) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = Math.max(0.01, from.width / Math.max(1, to.width));
    const sy = Math.max(0.01, from.height / Math.max(1, to.height));
    if (prefersReducedMotion()) {
      panel.style.transform = '';
      panel.style.opacity = '1';
      return;
    }
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
    if (prefersReducedMotion()) return;
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
    setTimeout(() => setAnimating(false), prefersReducedMotion() ? 0 : 210);
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
    setTimeout(() => setAnimating(false), prefersReducedMotion() ? 0 : 210);
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
    {
      label: 'Clarify the idea',
      detail: 'Explain it without the jargon',
      prompt: 'Explain this section simply',
      icon: Lightbulb,
    },
    {
      label: 'Make it concrete',
      detail: 'Connect it to a useful example',
      prompt: 'Give me a concrete example',
      icon: BookOpen,
    },
    {
      label: 'Check my recall',
      detail: 'Ask one focused question',
      prompt: 'Quiz me with one question',
      icon: Brain,
    },
  ];

  const renderPanelContent = (surface: 'inline' | 'expanded') => {
    const isExpandedSurface = surface === 'expanded';
    const surfaceTitleId = `ai-tutor-title-${surface}`;
    const composerHelpId = `section-tutor-composer-help-${surface}`;
    const canClear =
      history.some((message) => message.sender === 'user') && !isLoading;

    return (
      <>
        <header className="relative flex items-center justify-between gap-3 overflow-hidden border-b border-neutral-800/80 px-4 py-3.5 sm:px-5">
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(var(--accent),0.7)] to-transparent opacity-60"
            aria-hidden="true"
          />
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--accent),0.25)] bg-[rgba(var(--accent),0.09)] text-[rgb(var(--accent))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <BookOpen
                className="h-4 w-4"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span
                className="absolute -right-0.5 -bottom-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-neutral-950 bg-[rgb(var(--accent))]"
                aria-hidden="true"
              >
                <Check className="h-2 w-2 text-black" strokeWidth={3} />
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3
                  id={surfaceTitleId}
                  className="truncate text-sm font-semibold tracking-[-0.01em] text-neutral-100"
                >
                  Section tutor
                </h3>
                <span className="hidden items-center gap-1.5 rounded-full border border-[rgba(var(--accent),0.18)] bg-[rgba(var(--accent),0.07)] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--accent))] sm:inline-flex">
                  <span
                    className="h-1 w-1 rounded-full bg-[rgb(var(--accent))] motion-safe:animate-pulse"
                    aria-hidden="true"
                  />
                  Source ready
                </span>
              </div>
              <p className="truncate text-[11px] leading-4 text-neutral-500">
                Answers from the section in front of you
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={handleClear}
              aria-label="Clear tutor conversation"
              title="Clear conversation"
              disabled={!canClear}
              className="group inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-neutral-500 transition duration-200 hover:bg-white/[0.055] hover:text-neutral-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
            >
              <Trash2
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-rotate-6 motion-reduce:transition-none"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span className="hidden md:inline">Clear</span>
            </button>
            {!isExpandedSurface && (
              <button
                ref={expandBtnRef}
                onClick={openExpanded}
                aria-expanded={expanded}
                aria-label="Expand section tutor"
                title="Open focused view"
                className="group inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 text-xs font-medium text-neutral-300 shadow-sm transition duration-200 hover:border-neutral-700 hover:bg-neutral-800/80 hover:text-white active:scale-[0.97] motion-reduce:transition-none"
              >
                <Maximize2
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Focus</span>
              </button>
            )}
            {isExpandedSurface && (
              <button
                onClick={closeExpanded}
                aria-label="Close focused tutor"
                className="group inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2 text-xs font-medium text-neutral-300 shadow-sm transition duration-200 hover:border-neutral-700 hover:bg-neutral-800/80 hover:text-white active:scale-[0.97] motion-reduce:transition-none"
              >
                <X
                  className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-6 motion-reduce:transition-none"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
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
          aria-label="Section tutor conversation"
          className={`${isExpandedSurface ? 'flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7' : 'flex-1 space-y-4 overflow-y-auto px-4 py-5'} bg-gradient-to-b from-neutral-950/10 via-transparent to-neutral-950/30`}
        >
          {loadingHistory && (
            <div
              className="flex items-center gap-3 rounded-xl border border-neutral-800/70 bg-neutral-950/30 px-3.5 py-3 text-xs text-neutral-400"
              role="status"
            >
              <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(var(--accent),0.08)] text-[rgb(var(--accent))]">
                <MessageCircle
                  className="h-3.5 w-3.5"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span className="absolute inset-0 rounded-lg border border-[rgba(var(--accent),0.2)] motion-safe:animate-pulse" />
              </span>
              Restoring your conversation…
            </div>
          )}
          {!loadingHistory && historyError && (
            <div
              className="flex items-start gap-2.5 rounded-xl border border-amber-700/30 bg-amber-500/[0.06] p-3.5 text-xs leading-5 text-amber-100/90"
              role="alert"
            >
              <RotateCcw
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>
                {historyError.startsWith('Could not clear')
                  ? historyError
                  : 'Your previous notes could not be restored. You can still start a new conversation.'}
              </span>
            </div>
          )}
          {history.map((msg, index) => {
            if (msg.sender === 'ai' && !msg.text.trim()) return null;
            if (msg.sender === 'user') {
              return (
                <article
                  key={index}
                  className={`ml-auto min-w-0 ${isExpandedSurface ? 'max-w-[60ch]' : 'max-w-[92%] sm:max-w-[85%]'}`}
                >
                  <div className="mb-1.5 flex items-center justify-end gap-1.5 pr-1 text-[10px] font-medium tracking-[0.08em] text-neutral-600 uppercase">
                    Your question
                    <MessageCircle
                      className="h-3 w-3"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="rounded-xl rounded-tr-sm border border-white/[0.07] bg-white/[0.055] px-3.5 py-2.5 text-neutral-200 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.07] motion-reduce:transition-none">
                    <p className="text-sm leading-6 break-words whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  </div>
                </article>
              );
            }

            return (
              <article
                key={index}
                className={`group relative min-w-0 overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-950/35 shadow-[0_12px_30px_rgba(0,0,0,0.1)] transition duration-300 hover:border-neutral-700/80 hover:bg-neutral-950/50 motion-reduce:transition-none ${
                  isExpandedSurface ? 'w-full max-w-[82ch] p-5 sm:p-6' : 'p-4'
                }`}
              >
                <span
                  className="absolute inset-y-3 left-0 w-px bg-gradient-to-b from-transparent via-[rgb(var(--accent))] to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
                  aria-hidden="true"
                />
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">
                    <BookOpen
                      className="h-3 w-3 text-[rgb(var(--accent))]"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Lesson guidance
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-600">
                    <ShieldCheck
                      className="h-3 w-3"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    This section
                  </span>
                </div>
                <div
                  className={`markdown chat-md text-neutral-200 ${isExpandedSurface ? 'text-[0.95rem]' : 'text-sm'}`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </article>
            );
          })}
          {!loadingHistory &&
            history.length === 1 &&
            history[0]?.sender === 'ai' &&
            !isLoading &&
            documentContent && (
              <div
                className="space-y-2.5 pt-1"
                aria-label="Suggested questions"
              >
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <span className="text-[10px] font-semibold tracking-[0.1em] text-neutral-500 uppercase">
                    Choose a way in
                  </span>
                  <span className="h-px flex-1 bg-gradient-to-r from-neutral-800 to-transparent" />
                </div>
                <div
                  className={`grid gap-2 ${isExpandedSurface ? 'sm:grid-cols-3' : 'grid-cols-1'}`}
                >
                  {starterPrompts.map((suggestion) => {
                    const StarterIcon = suggestion.icon;
                    return (
                      <button
                        key={suggestion.prompt}
                        type="button"
                        onClick={() =>
                          void handleSendMessage(suggestion.prompt)
                        }
                        className="group flex min-w-0 items-center gap-3 rounded-xl border border-neutral-800/80 bg-neutral-950/25 px-3 py-2.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(var(--accent),0.3)] hover:bg-[rgba(var(--accent),0.055)] active:translate-y-0 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/80 text-neutral-500 transition duration-200 group-hover:border-[rgba(var(--accent),0.22)] group-hover:text-[rgb(var(--accent))] motion-reduce:transition-none">
                          <StarterIcon
                            className="h-3.5 w-3.5"
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-neutral-300 transition-colors group-hover:text-neutral-100 motion-reduce:transition-none">
                            {suggestion.label}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-neutral-600 transition-colors group-hover:text-neutral-500 motion-reduce:transition-none">
                            {suggestion.detail}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          {isLoading && (
            <div
              className={`relative overflow-hidden rounded-xl border border-neutral-800/80 bg-neutral-950/35 px-4 py-3.5 ${isExpandedSurface ? 'max-w-[82ch]' : ''}`}
              role="status"
              aria-label="The section tutor is preparing an answer"
            >
              <div
                className="absolute inset-y-0 left-0 w-px bg-[rgb(var(--accent))] opacity-50"
                aria-hidden="true"
              />
              <div className="flex items-center gap-3">
                <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--accent),0.18)] bg-[rgba(var(--accent),0.07)] text-[rgb(var(--accent))]">
                  <BookOpen
                    className="h-3.5 w-3.5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span className="absolute inset-0 rounded-lg border border-[rgba(var(--accent),0.2)] motion-safe:animate-pulse" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-neutral-300">
                    Working from this section
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-neutral-600">
                    <span>Building a focused answer</span>
                    <span className="flex gap-0.5" aria-hidden="true">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="h-0.5 w-0.5 rounded-full bg-neutral-500 motion-safe:animate-pulse"
                          style={{ animationDelay: `${dot * 180}ms` }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {failedQuestion && !isLoading && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800/80 bg-neutral-950/30 p-2 pl-3.5">
              <span className="min-w-0 truncate text-xs text-neutral-500">
                Your question is ready to try again.
              </span>
              <button
                type="button"
                onClick={() => void handleSendMessage(failedQuestion)}
                className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-neutral-700/80 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-200 transition duration-200 hover:border-neutral-600 hover:bg-neutral-800 active:scale-[0.98] motion-reduce:transition-none"
              >
                <RotateCcw
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-45 motion-reduce:transition-none"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Retry
              </button>
            </div>
          )}
        </div>

        <footer
          className={`${isExpandedSurface ? 'border-t border-neutral-800/80 bg-neutral-950/50 px-4 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:pt-4' : 'border-t border-neutral-800/80 bg-neutral-950/35 p-3.5'} backdrop-blur-sm`}
        >
          <div className={isExpandedSurface ? 'mx-auto max-w-[84ch]' : ''}>
            <div
              className={`group/composer flex items-end gap-2 rounded-xl border border-neutral-800 bg-black/25 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_8px_30px_rgba(0,0,0,0.12)] transition duration-200 focus-within:border-[rgba(var(--accent),0.42)] focus-within:bg-[rgba(var(--accent),0.025)] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_0_0_3px_rgba(var(--accent),0.06)] motion-reduce:transition-none ${isLoading || !documentContent || inputDisabled ? 'opacity-60' : ''}`}
            >
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
                        ? 'Ready when this section finishes loading'
                        : 'What would help this idea click?')
                }
                aria-label="Ask the section tutor"
                aria-describedby={composerHelpId}
                className={`min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-6 text-neutral-200 outline-none placeholder:text-neutral-600 ${isLoading || !documentContent || inputDisabled ? 'cursor-not-allowed' : ''}`}
                rows={1}
                style={{ minHeight: 42, maxHeight: 160, overflowY: 'auto' }}
                disabled={
                  isLoading || !documentContent || Boolean(inputDisabled)
                }
              />
              <button
                onClick={() => void handleSendMessage()}
                aria-label="Ask this question"
                disabled={
                  isLoading ||
                  !input.trim() ||
                  !documentContent ||
                  Boolean(inputDisabled)
                }
                className="group/send flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--accent),0.45)] bg-[rgb(var(--accent))] text-black shadow-[0_6px_18px_rgba(var(--accent),0.14)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(var(--accent),0.22)] hover:brightness-105 active:translate-y-0 active:scale-95 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-800 disabled:text-neutral-600 disabled:shadow-none motion-reduce:transform-none motion-reduce:transition-none"
              >
                {isLoading ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                ) : (
                  <Send
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>
            <div
              id={composerHelpId}
              className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px] leading-4 text-neutral-600"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck
                  className="h-3 w-3 text-neutral-500"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Grounded in this lesson
              </span>
              <span className="hidden sm:inline">
                Enter to ask · Shift + Enter for a new line
              </span>
            </div>
          </div>
        </footer>
      </>
    );
  };

  return (
    <>
      {/* Inline panel (placeholder during expanded) */}
      <div
        ref={inlineRef}
        className={`relative flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-800/90 bg-neutral-900/50 shadow-[0_24px_70px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-sm transition-[border-color,box-shadow] duration-300 hover:border-neutral-700/90 hover:shadow-[0_28px_80px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.035)] motion-reduce:transition-none ${expanded ? 'invisible' : ''}`}
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
              className={`absolute inset-0 bg-black/70 backdrop-blur-[5px] transition-opacity duration-300 motion-reduce:transition-none ${overlayReady ? 'opacity-100' : 'opacity-0'}`}
              tabIndex={-1}
            />
            {/* Modal panel */}
            <div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-tutor-title-expanded"
              className={`relative mx-3 w-full origin-top-right sm:mx-6 ${
                // On small screens, full-screen modal; desktop centered with max size
                ''
              } ${overlayReady ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.985] opacity-0'} transition-[transform,opacity] duration-300 ease-out motion-reduce:transform-none motion-reduce:transition-none`}
              style={{ maxWidth: '1040px' }}
            >
              <div className="relative flex h-[min(94vh,calc(100vh-2rem))] flex-col overflow-hidden rounded-2xl border border-neutral-700/70 bg-[rgba(12,12,12,0.96)] shadow-[0_40px_120px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.025)] sm:mx-auto sm:h-[min(90vh,calc(100vh-5rem))]">
                {renderPanelContent('expanded')}
              </div>
            </div>
          </div>,
          portalEl
        )}
    </>
  );
}
