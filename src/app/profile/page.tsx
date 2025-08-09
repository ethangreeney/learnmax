'use client';
import { useEffect, useMemo, useState } from 'react';

type PublicProfile = {
  id: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  image: string | null;
  elo: number;
  streak: number;
  masteredCount: number;
  quiz: { totalAttempts: number; correct: number; accuracy: number };
};

export default function ProfilePage() {
  const [me, setMe] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const profRes = await fetch('/api/users/me');
        const data = await profRes.json();
        if (!profRes.ok) throw new Error(data.error || 'Failed to load profile');
        setMe(data.user as PublicProfile);
        setName(data.user.name || '');
        setUsername(data.user.username || '');
        setBio(data.user.bio || '');
        setImage(data.user.image || null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const tier = useMemo(() => {
    const elo = me?.elo || 0;
    if (elo >= 2000) return 'Legend';
    if (elo >= 1700) return 'Master';
    if (elo >= 1400) return 'Expert';
    if (elo >= 1200) return 'Skilled';
    return 'Learner';
  }, [me?.elo]);

  async function onSave() {
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, bio, image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setMe((m) => (m ? { ...m, name, username, bio, image: image || null } : m));
    } catch (e: any) {
      alert(e?.message || 'Save failed');
    }
  }

  async function onPickAvatar(file: File) {
    try {
      // Request upload URL from blob API
      const resp = await fetch('/api/blob/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `avatars/${me?.id}.png`, contentType: file.type }),
      });
      const up = await resp.json();
      if (!resp.ok) throw new Error(up.error || 'Upload init failed');

      const { uploadUrl, url } = up;
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('Upload failed');
      setImage(url);
    } catch (e: any) {
      alert(e?.message || 'Avatar upload failed');
    }
  }

  if (loading) return <div className="container-narrow">Loading…</div>;
  if (error) return <div className="container-narrow text-red-400">{error}</div>;
  if (!me) return <div className="container-narrow">No profile.</div>;

  return (
    <div className="container-narrow space-y-8">
      <header className="flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-full border border-neutral-800 bg-neutral-900">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="avatar" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-500">?</div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{me.name || 'Your Profile'}</h1>
          <p className="text-neutral-400">Tier: {tier} • Elo {me.elo} • Streak {me.streak}🔥</p>
        </div>
      </header>

      <section className="card space-y-4 p-6">
        <h2 className="text-xl font-semibold">Edit Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2" />
          </label>
          <label className="grid gap-2 text-sm sm:col-span-2">
            <span>Bio</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <label className="rounded-md bg-neutral-800 px-3 py-2 text-sm cursor-pointer hover:bg-neutral-700">
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files && onPickAvatar(e.target.files[0])} />
            Change Avatar
          </label>
          <button onClick={onSave} className="rounded-md bg-[rgb(var(--accent))] px-4 py-2 text-sm font-semibold text-black">Save Changes</button>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-xl font-semibold">Learning Stats</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Mastered" value={String(me.masteredCount)} />
          <Stat label="Quiz Accuracy" value={`${me.quiz.accuracy}%`} sub={`${me.quiz.correct}/${me.quiz.totalAttempts}`} />
          <Stat label="Streak" value={String(me.streak)} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

// (duplicate removed)
