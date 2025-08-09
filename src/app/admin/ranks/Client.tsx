"use client";

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

type Rank = { slug: string; name: string; minElo: number; iconUrl: string | null };

export default function RankManagerClient({ initial }: { initial: Rank[] }) {
    const [ranks, setRanks] = useState<Rank[]>(initial || []);
    const [saving, setSaving] = useState(false);
    const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

    useEffect(() => {
        // If server provided no data, fetch as a fallback (shouldn't happen)
        (async () => {
            if (!ranks?.length) {
                const res = await fetch('/api/ranks');
                if (res.ok) {
                    const data = await res.json();
                    setRanks(data.ranks || []);
                }
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onPick = async (slug: string, file: File) => {
        const pathname = `ranks/${slug}.${file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : file.type === 'image/gif' ? 'gif' : 'jpg'}`;
        const { url } = await upload(pathname, file, {
            access: 'public',
            handleUploadUrl: '/api/blob/upload-url',
            contentType: file.type,
        });
        setRanks((prev) => prev.map((r) => (r.slug === slug ? { ...r, iconUrl: url } : r)));
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/ranks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ranks }),
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                alert(e.error || 'Failed to save');
                return;
            }
            const data = await res.json();
            setRanks(data.ranks || ranks);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4">
                {ranks.map((r) => (
                    <div key={r.slug} className="flex items-center gap-4 p-3 rounded-md border border-neutral-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.iconUrl || '/window.svg'} alt={r.name} className="h-10 w-10 rounded bg-neutral-900 object-cover" />
                        <div className="grid gap-1 flex-1">
                            <div className="font-medium">{r.name}</div>
                            <div className="text-sm text-neutral-400">Min ELO</div>
                            <input
                                type="number"
                                className="input max-w-[160px]"
                                value={r.minElo}
                                onChange={(e) => setRanks((prev) => prev.map((x) => (x.slug === r.slug ? { ...x, minElo: Number(e.target.value) } : x)))}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="btn-ghost cursor-pointer">
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                    ref={(el) => {
                                        fileInputs.current[r.slug] = el;
                                    }}
                                    onChange={(e) => e.target.files && onPick(r.slug, e.target.files[0])}
                                />
                                Change Icon
                            </label>
                        </div>
                    </div>
                ))}
            </div>
            <div>
                <button onClick={save} disabled={saving} className="btn-primary px-4 py-2">
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
}


