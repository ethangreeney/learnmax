'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Paperclip,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  uploadPdfToBlob,
  createLectureFromContentAndBlobUrls,
} from '@/lib/client/lectures';

export default function LearnClient() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<Array<{ name: string; url: string }>>([]);
  const [platform, setPlatform] = useState<'mac' | 'other' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const browserNavigator = navigator as Navigator & {
      userAgentData?: { platform?: string };
    };
    const detectedPlatform = browserNavigator.userAgentData?.platform || '';
    const isMac =
      detectedPlatform === 'macOS' ||
      /Mac|iPhone|iPad|iPod/i.test(browserNavigator.platform) ||
      /Mac/i.test(browserNavigator.userAgent);
    setPlatform(isMac ? 'mac' : 'other');
  }, []);

  const shortcutLabel =
    platform === 'mac'
      ? '⌘ Enter'
      : platform === 'other'
        ? 'Ctrl Enter'
        : '⌘ / Ctrl Enter';
  const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0;

  const handleCreate = async () => {
    const text = input.trim();
    if ((files.length === 0 && !text) || loading || uploading) return;
    setLoading(true);
    setErr(null);
    try {
      const { lectureId } = await createLectureFromContentAndBlobUrls(
        text,
        files.map((f) => f.url)
      );
      window.location.href = `/learn/${lectureId}`;
    } catch (e: any) {
      setErr(e.message || 'Failed to create lecture.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const pdfs = Array.from(fileList).filter((f) => /pdf$/i.test(f.name));
    if (pdfs.length === 0) {
      setErr('Please select PDF files only.');
      return;
    }
    setUploading(true);
    setErr(null);
    try {
      const urls: Array<{ name: string; url: string }> = [];
      for (const f of pdfs) {
        const url = await uploadPdfToBlob(f);
        urls.push({ name: f.name, url });
      }
      setFiles((prev) => [...prev, ...urls]);
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/45 shadow-[0_22px_70px_-40px_rgba(0,0,0,0.9)] transition-[border-color,box-shadow] duration-300 hover:border-neutral-700/90 hover:shadow-[0_24px_80px_-42px_rgba(16,185,129,0.22)] motion-reduce:transition-none">
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-3 border-b border-neutral-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-2 motion-reduce:transform-none motion-reduce:transition-none">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100">
              Source material
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Notes, readings, slides, or a combination
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/70 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
          <ShieldCheck
            className="h-3.5 w-3.5 text-emerald-400"
            aria-hidden="true"
          />
          Private to your account
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="p-4 sm:p-5 lg:border-r lg:border-neutral-800/80">
          <label htmlFor="lesson-source" className="sr-only">
            Paste your study material
          </label>
          <textarea
            id="lesson-source"
            className="min-h-[210px] w-full resize-y rounded-xl border border-neutral-800 bg-neutral-900/55 p-4 text-sm leading-7 text-neutral-100 transition-[border-color,background-color,box-shadow] duration-200 outline-none placeholder:text-neutral-600 hover:border-neutral-700 focus:border-emerald-500/70 focus:bg-neutral-900 focus:ring-4 focus:ring-emerald-500/8 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
            placeholder="Paste the full notes, reading, or topic you want to understand…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void handleCreate();
              }
            }}
            disabled={loading}
            aria-describedby="lesson-source-help"
          />
          <div
            id="lesson-source-help"
            className="mt-2 flex items-center justify-between gap-4 px-1 text-xs text-neutral-500"
          >
            <span>More context creates a sharper lesson.</span>
            <span className="shrink-0 tabular-nums">
              {wordCount ? `${wordCount} words` : 'No text yet'}
            </span>
          </div>
        </div>

        <div className="flex flex-col p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-neutral-500 uppercase">
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            Attach readings
          </div>
          <div
            className={`mt-3 flex min-h-40 flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-[border-color,background-color,transform] duration-200 motion-reduce:transform-none motion-reduce:transition-none ${
              dragOver
                ? 'scale-[1.015] border-emerald-400 bg-emerald-500/8'
                : 'border-neutral-700 bg-neutral-900/30 hover:border-neutral-600 hover:bg-neutral-900/55'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              await handleUploadFiles(e.dataTransfer.files);
            }}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-950 text-neutral-400 transition-colors group-hover:text-neutral-300">
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-neutral-200">
              Drop PDFs here
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              Add slides or readings to ground the lesson.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={async (e) => {
                await handleUploadFiles(e.target.files);
              }}
            />
            <button
              type="button"
              className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/25 transition-all hover:bg-emerald-500/10 hover:text-emerald-200 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Choose PDF files'}
            </button>
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="border-t border-neutral-800/80 px-5 py-3 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <div
                key={`${file.url}-${index}`}
                className="group/file flex max-w-full items-center gap-2 rounded-lg border border-neutral-700/80 bg-neutral-900/70 py-1.5 pr-1.5 pl-2 text-xs text-neutral-300 transition-colors hover:border-neutral-600 motion-reduce:transition-none"
              >
                <CheckCircle2
                  className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <span className="max-w-[240px] truncate" title={file.name}>
                  {file.name}
                </span>
                <button
                  type="button"
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white motion-reduce:transition-none"
                  onClick={() =>
                    setFiles((previous) =>
                      previous.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-neutral-800/80 bg-neutral-900/25 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 text-xs text-neutral-500">
          <span className="font-medium text-neutral-400">Tip</span>
          <span className="mx-1.5 text-neutral-700" aria-hidden="true">
            ·
          </span>
          Use{' '}
          <kbd className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-sans text-[11px] text-neutral-300">
            {shortcutLabel}
          </kbd>{' '}
          when you are ready.
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={
            loading || uploading || (!input.trim() && files.length === 0)
          }
          title={`${shortcutLabel} to create`}
          className="group/create btn-primary min-w-40 px-5 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? 'Building lesson…'
            : uploading
              ? 'Adding PDFs…'
              : 'Build my lesson'}
          {!loading && !uploading && (
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover/create:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
              aria-hidden="true"
            />
          )}
        </button>
      </div>

      {err && (
        <div
          className="border-t border-red-900/60 bg-red-950/25 px-5 py-3 text-sm text-red-300 sm:px-6"
          role="alert"
        >
          {err}
        </div>
      )}
    </div>
  );
}
