'use client';

import { useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { uploadPdfToBlob, createLectureFromContentAndBlobUrls } from '@/lib/client/lectures';

export default function LearnClient() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<Array<{ name: string; url: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCreate = async () => {
    const text = input.trim();
    if ((files.length === 0 && !text) || loading) return;
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
          disabled={loading || uploading || (!input.trim() && files.length === 0)}
          className="btn-primary disabled:opacity-50"
        >
          {loading || uploading ? 'Preparing…' : 'Create Lecture'}
        </button>
        <button
          onClick={() => setInput('')}
          disabled={loading}
          className="btn-ghost disabled:opacity-50"
        >
          Reset
        </button>
      </div>

      {/* Upload PDFs */}
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
            await handleUploadFiles(e.dataTransfer.files);
          }}
        >
          <p className="text-sm text-neutral-300">Drag & drop one or more PDFs to attach</p>
          <div className="mt-3 flex items-center justify-center gap-2">
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
              className="btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Upload PDFs'}
            </button>
          </div>
        </div>
        {files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <div key={`${f.url}-${idx}`} className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800/60 px-2 py-1 text-sm">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-neutral-700 text-[10px] font-bold">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="max-w-[220px] truncate" title={f.name}>{f.name}</span>
                <button
                  type="button"
                  className="ml-1 rounded px-1 text-neutral-400 hover:text-white"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {err && (
        <div className="text-sm text-red-400" role="alert">
          {err}
        </div>
      )}
    </div>
  );
}


