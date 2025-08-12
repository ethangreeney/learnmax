'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { upload } from '@vercel/blob/client';
import AvatarCropper from '@/components/AvatarCropper';

export type PublicProfile = {
  id: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  image: string | null;
  elo: number;
  streak: number;
  masteredCount: number;
  quiz: { totalAttempts: number; correct: number; accuracy: number };
  isAdmin?: boolean;
  rank?: {
    slug: string;
    name: string;
    minElo: number;
    iconUrl: string | null;
  } | null;
};

export default function ProfileClient({
  initialUser,
}: {
  initialUser: PublicProfile;
}) {
  const [name, setName] = useState(initialUser.name || '');
  const [username, setUsername] = useState(initialUser.username || '');
  const [bio, setBio] = useState(initialUser.bio || '');
  const [image, setImage] = useState<string | null>(initialUser.image || null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const USERNAME_RULE = /^[a-z0-9_]{3,20}$/; // a-z, 0-9, underscore, 3-20 chars
  const usernameValid = username.length === 0 || USERNAME_RULE.test(username);
  const bioLimit = 240;

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      if (username && !USERNAME_RULE.test(username)) {
        throw new Error('Username can only contain a-z, 0-9, _ and be 3–20 chars');
      }
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, bio, image }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(file: File) {
    try {
      if (file.type === 'image/gif') {
        throw new Error('GIFs are not allowed for profile pictures');
      }
      const objectUrl = URL.createObjectURL(file);
      setCropSrc(objectUrl);
    } catch (e: any) {
      setError(e?.message || 'Avatar upload failed');
    }
  }

  return (
    <div className="card space-y-6 p-6">
      {cropSrc && (
        <AvatarCropper
          src={cropSrc}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
          onCropped={async (croppedFile) => {
            try {
              const pathname = `avatars/${initialUser.id}.webp`;
              const { url } = await upload(pathname, croppedFile, {
                access: 'public',
                handleUploadUrl: '/api/blob/upload-url',
                contentType: 'image/webp',
              });
              const bust = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
              setImage(bust);
              setCropSrc(null);
              const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: bust }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.warn('Failed to persist avatar:', data);
              }
            } catch (err: any) {
              setError(err?.message || 'Avatar upload failed');
            } finally {
              URL.revokeObjectURL(cropSrc);
            }
          }}
        />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Edit Profile</h2>
        {savedAt && (
          <div className="text-xs text-neutral-500">Saved just now</div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input h-10"
            placeholder="Display name"
          />
          {/* Spacer to align with Username helper text on md+ screens */}
          <span className="hidden text-xs invisible md:block" aria-hidden="true">
            Use a–z, 0–9, underscore. 3–20 characters.
          </span>
        </label>
        <label className="grid gap-2 text-sm">
          <span className="muted">Username</span>
          <div className={`flex h-10 items-center rounded-md bg-neutral-900/80 ${username && !usernameValid ? 'ring-1 ring-red-500' : 'ring-1 ring-neutral-700'}`}>
            <span className="pl-3 pr-1 text-neutral-500 select-none" aria-hidden="true">@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="w-full bg-transparent px-2 text-sm outline-none"
              placeholder="your_handle"
              autoComplete="off"
            />
          </div>
          <span className={`text-xs ${username && !usernameValid ? 'text-red-400' : 'text-neutral-500'}`}>
            Use a–z, 0–9, underscore. 3–20 characters.
          </span>
        </label>

        <label className="md:col-span-2 grid gap-2 text-sm">
          <span className="muted">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, bioLimit))}
            rows={4}
            maxLength={bioLimit}
            className="input p-4"
            placeholder="Share a little about what you're learning…"
          />
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Visible on your public profile.</span>
            <span>{bio.length}/{bioLimit}</span>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-ghost cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files && onPickAvatar(e.target.files[0])}
          />
          <ImageIcon className="h-4 w-4" />
          Change Avatar
        </label>
        <button onClick={onSave} disabled={saving || (!!username && !usernameValid)} className="btn-primary">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
      {error && <div className="text-sm text-red-400" aria-live="polite">{error}</div>}
    </div>
  );
}
