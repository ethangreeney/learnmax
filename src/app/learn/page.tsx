// 'use client' makes this a valid client component with a default export.
'use client';

import { useRef, useState } from 'react';
import { createLectureFromPdf } from '@/lib/client/lectures';

async function createLectureFromText(
  content: string
): Promise<{ lectureId: string }> {
  const res = await fetch('/api/lectures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Failed: ${res.status}`);
  }
  return res.json();
}

export default function LearnWorkspacePage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCreate = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const { lectureId } = await createLectureFromText(text);
      window.location.href = `/learn/${lectureId}`;
    } catch (e: any) {
      setErr(e.message || 'Failed to create lecture.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-narrow space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Learn Workspace</h1>
        <p className="text-sm text-neutral-400">
          Paste text and create a persistent lecture. You’ll be redirected to
          the lecture page with explanations and quizzes.
        </p>
      </header>

      <div className="card space-y-4 p-5">
        <textarea
          className="input min-h-[160px]"
          placeholder="What do you want to learn about? Paste any study notes or PDF lecture slides here"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            disabled={loading || !input.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {loading || uploading ? 'Analysing Content…' : 'Create Lecture'}
          </button>
          <button
            onClick={() => setInput('')}
            disabled={loading}
            className="btn-ghost disabled:opacity-50"
          >
            Reset
          </button>
        </div>

        {/* Upload PDF */}
        <div className="pt-2">
          <div
            className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? 'border-[rgb(var(--accent))] bg-[rgba(var(--accent),0.06)]'
                : 'border-neutral-700'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (!f) return;
              if (!/pdf$/i.test(f.name)) {
                setErr('Please drop a single PDF file.');
                return;
              }
              try {
                setUploading(true);
                setErr(null);
                const { lectureId } = await createLectureFromPdf(f);
                window.location.href = `/learn/${lectureId}`;
              } catch (e: any) {
                setErr(e.message || 'Upload failed');
              } finally {
                setUploading(false);
              }
            }}
          >
            <p className="text-sm text-neutral-300">
              Drag & drop a PDF here to create a lecture
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setUploading(true);
                    setErr(null);
                    const { lectureId } = await createLectureFromPdf(f);
                    window.location.href = `/learn/${lectureId}`;
                  } catch (e: any) {
                    setErr(e.message || 'Upload failed');
                  } finally {
                    setUploading(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }
                }}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Upload PDF'}
              </button>
            </div>
          </div>
        </div>
        {err && (
          <div className="text-sm text-red-400" role="alert">
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
