"use client";

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { upload } from '@vercel/blob/client';

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
    rank?: { slug: string; name: string; minElo: number; iconUrl: string | null } | null;
};

export default function ProfileClient({ initialUser }: { initialUser: PublicProfile }) {
    const [name, setName] = useState(initialUser.name || "");
    const [username, setUsername] = useState(initialUser.username || "");
    const [bio, setBio] = useState(initialUser.bio || "");
    const [image, setImage] = useState<string | null>(initialUser.image || null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    async function onSave() {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, username, bio, image }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to save');
            }
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
            const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
            const pathname = `avatars/${initialUser.id}.${ext}`;
            const { url } = await upload(pathname, file, {
                access: 'public',
                handleUploadUrl: '/api/blob/upload-url',
                contentType: file.type,
            });
            const bust = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
            setImage(bust);
            try {
                const res = await fetch('/api/users/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: bust }),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    console.warn('Failed to persist avatar:', data);
                }
            } catch (persistErr) {
                console.warn('Error persisting avatar', persistErr);
            }
        } catch (e: any) {
            setError(e?.message || 'Avatar upload failed');
        }
    }

    return (
        <div className="card p-6 space-y-5">
            <h2 className="text-xl font-semibold">Edit Profile</h2>
            <div className="grid gap-4">
                <label className="grid gap-2 text-sm">
                    <span className="muted">Name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
                </label>
                <label className="grid gap-2 text-sm">
                    <span className="muted">Username</span>
                    <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" placeholder="your-handle" />
                </label>
                <label className="grid gap-2 text-sm">
                    <span className="muted">Bio</span>
                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="input" />
                </label>
            </div>
            <div className="flex items-center gap-3">
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
                <button onClick={onSave} disabled={saving} className="btn-primary">
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
            {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
    );
}
