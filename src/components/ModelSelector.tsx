'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ai:model';
const MODELS = [
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
];

export default function ModelSelector() {
  const [model, setModel] = useState<string>('gemini-2.5-flash');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const isAllowed = MODELS.some((m) => m.id === saved);
        const fallback = 'gemini-2.5-flash';
        const next = isAllowed ? saved : fallback;
        if (!isAllowed) {
          localStorage.setItem(STORAGE_KEY, next);
        }
        setModel(next);
      }
    } catch {}
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setModel(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-neutral-400">Model:</span>
      <select
        value={model}
        onChange={onChange}
        className="rounded-md bg-neutral-900 border border-neutral-700 px-2 py-1 text-neutral-200"
        aria-label="AI model selector"
      >
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
    </div>
  );
}


