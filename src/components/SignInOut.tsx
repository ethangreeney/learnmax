'use client';

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useMeStore } from '@/lib/client/me-store';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';

export default function SignInOut() {
  const { data: session, status } = useSession();
  const setMe = useMeStore((s) => s.setMe);
  const meImage = useMeStore((s) => s.image);
  const meName = useMeStore((s) => s.name);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const routeKey = `${pathname || ''}|${searchParams?.toString() || ''}`;

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
    return (
      <div
        className="account-skeleton"
        role="status"
        aria-label="Loading account"
      />
    );
  }

  if (!session) {
    // If we're already on the login page (either /login or any subpath like /login/...),
    // hide the Sign In link so it doesn't appear while the user is already on the sign-in UI.
    const isLoginPage =
      pathname === '/login' || (pathname && pathname.startsWith('/login/'));
    if (isLoginPage) {
      return null;
    }

    const href = (() => {
      try {
        const path = pathname
          ? `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}${typeof window !== 'undefined' ? window.location.hash || '' : ''}`
          : '/learn';
        const p = new URLSearchParams({
          next: path,
          reason: 'general',
          src: 'ui_button',
        });
        return `/login?${p.toString()}`;
      } catch {
        return '/login';
      }
    })();
    return (
      <Link key={routeKey} href={href} className="btn-primary header-signin">
        Sign In
      </Link>
    );
  }

  const user = session.user as { name?: string | null; image?: string | null };
  const displayName = meName || user?.name || 'Profile';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  const profileIsCurrent =
    pathname === '/profile' || Boolean(pathname?.startsWith('/profile/'));

  return (
    <div className="flex min-w-0 items-center gap-1" key={routeKey}>
      <Link
        href="/profile"
        className="account-link"
        aria-label={`Open ${displayName}'s profile`}
        aria-current={profileIsCurrent ? 'page' : undefined}
      >
        <span className="account-avatar">
          {meImage || user?.image ? (
            (meImage || user?.image || '').toLowerCase().includes('.gif') ||
            (meImage || user?.image || '').toLowerCase().includes('.webp') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meImage || user?.image || ''}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Image
                src={meImage || user?.image || ''}
                alt=""
                fill
                sizes="28px"
                className="object-cover"
                priority={false}
              />
            )
          ) : (
            <span className="grid h-full w-full place-items-center bg-neutral-900 text-[9px] font-semibold text-neutral-400 uppercase">
              {initials || 'Y'}
            </span>
          )}
        </span>
        <span className="account-name">{displayName}</span>
      </Link>
      <button
        type="button"
        onClick={async () => {
          setIsSigningOut(true);
          try {
            await signOut({ callbackUrl: '/welcome' });
          } finally {
            setIsSigningOut(false);
          }
        }}
        disabled={isSigningOut}
        className="account-signout"
      >
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
