'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect } from 'react';
import { useMeStore } from '@/lib/client/me-store';
import Link from 'next/link';
import Image from 'next/image';

export default function SignInOut() {
  const { data: session, status } = useSession();
  const setMe = useMeStore((s) => s.setMe);
  const meImage = useMeStore((s) => s.image);
  const meName = useMeStore((s) => s.name);

  // Place hooks before any conditional returns to preserve hook order
  useEffect(() => {
    if (session?.user) {
      setMe({
        id: (session.user as any).id || null,
        name: session.user.name || null,
        image: session.user.image || null,
        username: (session.user as any).username || null,
      });
    }
  }, [session, setMe]);

  if (status === 'loading') {
    return <span className="text-sm text-neutral-400">Loading...</span>;
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn('google')}
        className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black"
      >
        Sign In
      </button>
    );
  }

  const user = session.user as { name?: string | null; image?: string | null };
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/profile"
        className="group relative inline-flex h-8 w-8 overflow-hidden rounded-full ring-1 ring-neutral-800"
        aria-label="Open profile"
      >
        {(meImage || user?.image) ? (
          ((meImage || user?.image || '').toLowerCase().includes('.gif') || (meImage || user?.image || '').toLowerCase().includes('.webp')) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meImage || user?.image || ''} alt={meName || user?.name || 'avatar'} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <Image
              src={meImage || user?.image || ''}
              alt={meName || user?.name || 'avatar'}
              fill
              sizes="32px"
              className="object-cover"
              priority={false}
            />
          )
        ) : (
          <span className="grid h-full w-full place-items-center bg-neutral-900 text-[10px] text-neutral-400">
            You
          </span>
        )}
      </Link>
      <button
        onClick={() => signOut()}
        className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm"
      >
        Sign Out
      </button>
    </div>
  );
}
