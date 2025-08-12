'use client';
import { useEffect, useState } from 'react';

export default function FollowButton({
  targetUserId,
  initial,
}: {
  targetUserId: string;
  initial?: boolean;
}) {
  const [isFollowing, setIsFollowing] = useState<boolean>(!!initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initial !== undefined) return;
    (async () => {
      try {
        const res = await fetch('/api/users/me/following');
        const data = await res.json();
        if (res.ok && Array.isArray(data.following)) {
          setIsFollowing((data.following as string[]).includes(targetUserId));
        }
      } catch {}
    })();
  }, [initial, targetUserId]);

  async function toggle() {
    setLoading(true);
    try {
      if (isFollowing) {
        const res = await fetch('/api/users/follow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId }),
        });
        if (!res.ok) throw new Error('Failed to unfollow');
        setIsFollowing(false);
      } else {
        const res = await fetch('/api/users/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId }),
        });
        if (!res.ok) throw new Error('Failed to follow');
        setIsFollowing(true);
      }
    } catch (e) {
      // no-op; could show toast
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      aria-pressed={isFollowing}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors ring-1 ring-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed ${
        isFollowing
          ? 'bg-neutral-800 text-white hover:bg-neutral-700'
          : 'bg-neutral-900 text-neutral-200 hover:bg-neutral-800'
      }`}
      disabled={loading}
      onClick={toggle}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}
