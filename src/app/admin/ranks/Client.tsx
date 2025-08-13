'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import AvatarCropper from '@/components/AvatarCropper';

type Rank = {
  slug: string;
  name: string;
  minElo: number;
  iconUrl: string | null;
};

export default function RankManagerClient({
  initialRanks,
}: {
  initialRanks: Rank[];
}) {
  const [ranks, setRanks] = useState<Rank[]>(initialRanks || []);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  async function persistIcon(slug: string, iconUrl: string | null) {
    try {
      const current = ranks.find((r) => r.slug === slug) || null;
      const res = await fetch('/api/ranks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ranks: [
            {
              slug,
              // Include current name/minElo so new rows are created with correct metadata
              name: current?.name,
              minElo: current?.minElo,
              iconUrl,
            },
          ],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        // Surface but don't block UI
        alert(e.error || 'Failed to save rank icon');
      }
    } catch {
      // Non-fatal; admin can retry Save Changes
    }
  }

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

  const seedRanks = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/admin/ranks/seed', { method: 'POST' });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error || 'Failed to seed ranks');
        return;
      }
      // Refresh the ranks after seeding
      const ranksRes = await fetch('/api/ranks');
      if (ranksRes.ok) {
        const data = await ranksRes.json();
        setRanks(data.ranks || []);
      }
    } finally {
      setSeeding(false);
    }
  };

  const onPick = async (slug: string, file: File) => {
    // Allow GIFs to be uploaded directly (no cropping)
    if (file.type === 'image/gif') {
      const pathname = `ranks/${slug}.gif`;
      const { url } = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload-url',
        contentType: 'image/gif',
      });
      setRanks((prev) =>
        prev.map((r) => (r.slug === slug ? { ...r, iconUrl: url } : r))
      );
      // Auto-persist immediately so other UIs (leaderboard) pick up the change
      await persistIcon(slug, url);
      return;
    }

    // For static images, open cropper and export to WebP before upload
    const objectUrl = URL.createObjectURL(file);
    setPendingSlug(slug);
    setCropSrc(objectUrl);
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
      {cropSrc && pendingSlug && (
        <AvatarCropper
          src={cropSrc}
          aspect={1}
          outputSize={256}
          filename={`${pendingSlug}.webp`}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
            setPendingSlug(null);
          }}
          onCropped={async (croppedFile) => {
            try {
              const pathname = `ranks/${pendingSlug}.webp`;
              const { url } = await upload(pathname, croppedFile, {
                access: 'public',
                handleUploadUrl: '/api/blob/upload-url',
                contentType: 'image/webp',
              });
              setRanks((prev) =>
                prev.map((r) =>
                  r.slug === pendingSlug ? { ...r, iconUrl: url } : r
                )
              );
              if (pendingSlug) {
                await persistIcon(pendingSlug, url);
              }
            } finally {
              URL.revokeObjectURL(cropSrc);
              setCropSrc(null);
              setPendingSlug(null);
            }
          }}
        />
      )}
      {ranks.length === 0 && (
        <div className="rounded-md border border-neutral-800 p-6 text-center">
          <p className="mb-4 text-neutral-400">
            No ranks found. Seed the default ranks to get started.
          </p>
          <button
            onClick={seedRanks}
            disabled={seeding}
            className="btn-primary"
          >
            {seeding ? 'Seeding...' : 'Seed Default Ranks'}
          </button>
        </div>
      )}

      {ranks.length > 0 && (
        <>
          <div className="grid gap-4">
            {ranks.map((r) => (
              <div
                key={r.slug}
                className="flex items-center gap-4 rounded-md border border-neutral-800 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.iconUrl || '/window.svg'}
                  alt={r.name}
                  className="h-10 w-10 rounded bg-neutral-900 object-cover"
                />
                <div className="grid flex-1 gap-1">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm text-neutral-400">Min ELO</div>
                  <input
                    type="number"
                    className="input max-w-[160px]"
                    value={r.minElo}
                    onChange={(e) =>
                      setRanks((prev) =>
                        prev.map((x) =>
                          x.slug === r.slug
                            ? { ...x, minElo: Number(e.target.value) }
                            : x
                        )
                      )
                    }
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
                      onChange={(e) =>
                        e.target.files && onPick(r.slug, e.target.files[0])
                      }
                    />
                    Change Icon
                  </label>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary px-4 py-2"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={seedRanks}
              disabled={seeding}
              className="btn-ghost px-4 py-2"
            >
              {seeding ? 'Seeding...' : 'Reset to Defaults'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
