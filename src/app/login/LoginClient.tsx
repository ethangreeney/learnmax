'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

async function postTelemetry(event: string, payload: Record<string, any>) {
  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    });
  } catch {}
}

export default function LoginClient({
  callbackUrl,
  hasGoogle,
  hasGitHub,
  hasApple,
  reason,
  src,
  className,
}: {
  callbackUrl: string;
  hasGoogle: boolean;
  hasGitHub?: boolean;
  hasApple?: boolean;
  reason?: string;
  src?: string;
  className?: string;
}) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  useEffect(() => {
    postTelemetry('login_impression', { reason, src });
  }, [reason, src]);

  const providers = useMemo(() => (
    [
      hasGoogle ? { id: 'google', label: 'Continue with Google' } : null,
      hasGitHub ? { id: 'github', label: 'Continue with GitHub' } : null,
      hasApple ? { id: 'apple', label: 'Continue with Apple' } : null,
    ].filter(Boolean) as { id: string; label: string }[]
  ), [hasGoogle, hasGitHub, hasApple]);

  const handleClick = useCallback(async (providerId: string) => {
    try {
      setIsLoading(providerId);
      await postTelemetry('login_provider_click', { provider: providerId, reason, src });
      await signIn(providerId, { callbackUrl });
    } catch (err: any) {
      setIsLoading(null);
      await postTelemetry('login_error', { provider: providerId, reason, src, code: err?.message || 'unknown' });
    }
  }, [callbackUrl, reason, src]);

  if (providers.length === 0) {
    return (
      <button className={`btn-primary ${className || 'px-4 py-2'} opacity-50 cursor-not-allowed`} disabled>
        No sign-in methods available
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <button
          key={p.id}
          onClick={() => handleClick(p.id)}
          disabled={Boolean(isLoading) && isLoading !== p.id}
          className={`btn-primary ${className || 'px-4 py-2'} ${isLoading === p.id ? 'opacity-70' : ''}`}
          aria-label={p.label}
        >
          {isLoading === p.id ? 'Continuing…' : p.label}
        </button>
      ))}
    </div>
  );
}


