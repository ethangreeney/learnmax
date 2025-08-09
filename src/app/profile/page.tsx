'use client';
import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Flame, Target, User as UserIcon, Image as ImageIcon } from 'lucide-react';
import { upload } from '@vercel/blob/client';

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

  // No dynamic color; keep header consistently green per request

  const tierColor = useMemo(() => {
    const elo = me?.elo || 0;
    if (elo >= 2000) return 'from-yellow-300 via-amber-200 to-rose-300';
    if (elo >= 1700) return 'from-purple-300 via-indigo-300 to-cyan-300';
    if (elo >= 1400) return 'from-green-300 via-emerald-300 to-teal-300';
    if (elo >= 1200) return 'from-blue-300 via-cyan-300 to-sky-300';
    return 'from-neutral-300 via-neutral-200 to-neutral-100';
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
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const pathname = `avatars/${me?.id}.${ext}`;
      const { url } = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload-url',
        contentType: file.type,
      });
      const bust = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
      setImage(bust);
      // Persist immediately so the avatar survives reloads
      try {
        const res = await fetch('/api/users/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: bust }),
        });
        if (res.ok) {
          setMe((m) => (m ? { ...m, image: bust } : m));
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn('Failed to persist avatar:', data);
        }
      } catch (persistErr) {
        console.warn('Error persisting avatar', persistErr);
      }
    } catch (e: any) {
      alert(e?.message || 'Avatar upload failed');
    }
  }

  if (loading) {
    return (
      <div className="container-narrow space-y-6">
        <div className="card h-44 animate-pulse" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card h-64 animate-pulse" />
          <div className="card h-64 animate-pulse" />
        </div>
      </div>
    );
  }
  if (error) return <div className="container-narrow text-red-400">{error}</div>;
  if (!me) return <div className="container-narrow">No profile.</div>;

  return (
    <div className="container-narrow space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden card">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-400/10 to-transparent" />
        <div className="p-5 md:p-6 pb-8 md:pb-10">
            <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="relative self-center top-[6px]">
              <div className="h-20 w-20 rounded-full ring-2 ring-neutral-800 overflow-hidden bg-neutral-900">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt="avatar"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-neutral-500">
                    <UserIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {me.name || 'Your Profile'}
                </h1>
                <span className={`inline-flex items-center gap-2 rounded-full bg-neutral-900/70 ring-1 ring-neutral-800 px-3 py-1 text-xs`}
                >
                  <span className={`bg-gradient-to-r ${tierColor} bg-clip-text text-transparent font-semibold`}>{tier}</span>
                  <span className="text-neutral-400">Elo {me.elo}</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-400">
                {me.username ? `@${me.username}` : 'Pick a username to claim your handle'}
              </p>
            </div>
            </div>

            <div className="hidden md:flex items-center gap-2 shrink-0 relative top-[2px]">
              <Chip icon={Flame} label={`${me.streak} day${me.streak === 1 ? '' : 's'} streak`} />
              <Chip icon={Target} label={`${me.masteredCount} mastered`} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {/* Edit card */}
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
            <button onClick={onSave} className="btn-primary">Save Changes</button>
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>

        {/* Stats card */}
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">Learning Stats</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Mastered" value={String(me.masteredCount)} icon={Target} />
            <Stat label="Accuracy" value={`${me.quiz.accuracy}%`} sub={`${me.quiz.correct}/${me.quiz.totalAttempts}`} icon={BrainCircuit} />
            <Stat label="Streak" value={String(me.streak)} icon={Flame} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Chip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/70 px-3 py-1 text-xs ring-1 ring-neutral-800">
      <Icon className="h-3.5 w-3.5 text-neutral-300" />
      <span>{label}</span>
    </span>
  );
}

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-400">{label}</div>
        <Icon className="h-4 w-4 text-neutral-300" />
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

