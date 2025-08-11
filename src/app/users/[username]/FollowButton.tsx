'use client';
import { useEffect, useState } from 'react';

export default function FollowButton({ targetUserId, initial }: { targetUserId: string; initial?: boolean }) {
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
      className={`text-xs px-3 py-1 rounded-md ring-1 ring-neutral-800 ${isFollowing ? 'bg-neutral-800 text-white' : 'bg-neutral-900 text-neutral-300'} disabled:opacity-50`}
      disabled={loading}
      onClick={toggle}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}


