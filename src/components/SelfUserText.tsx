'use client';

import { useMeStore } from '@/lib/client/me-store';

export function SelfName({ userId, fallback }: { userId: string; fallback: string }) {
  const me = useMeStore();
  const name = me.id === userId && typeof me.name === 'string' && me.name.length > 0 ? me.name : fallback;
  return <>{name}</>;
}

export function SelfUsername({ userId, fallback }: { userId: string; fallback: string | null }) {
  const me = useMeStore();
  const uname = me.id === userId && typeof me.username === 'string' && me.username.length > 0 ? me.username : fallback;
  if (!uname) return null;
  return <>@{uname}</>;
}


