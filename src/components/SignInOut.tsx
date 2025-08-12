'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

export default function SignInOut() {
  const { data: session, status } = useSession();

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
        {user?.image ? (
          <Image
            src={user.image}
            alt={user?.name || 'avatar'}
            fill
            sizes="32px"
            className="object-cover"
            priority={false}
          />
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
