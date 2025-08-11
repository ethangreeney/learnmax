'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';

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

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => signOut()}
        className="rounded-md border border-neutral-600 px-3 py-1.5 text-sm"
      >
        Sign Out
      </button>
    </div>
  );
}
