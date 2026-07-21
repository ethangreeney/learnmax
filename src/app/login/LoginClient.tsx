'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

async function postTelemetry(event: string, payload: Record<string, unknown>) {
  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    });
  } catch {}
}

function loginErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === 'OAuthAccountNotLinked') {
    return 'This email is linked to a different sign-in method.';
  }
  return 'We couldn’t start sign-in. Check your connection and try again.';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void postTelemetry('login_impression', { reason, src });
  }, [reason, src]);

  const providers = useMemo(
    () =>
      [
        hasGoogle ? { id: 'google', label: 'Continue with Google' } : null,
        hasGitHub ? { id: 'github', label: 'Continue with GitHub' } : null,
        hasApple ? { id: 'apple', label: 'Continue with Apple' } : null,
      ].filter(Boolean) as { id: string; label: string }[],
    [hasGoogle, hasGitHub, hasApple]
  );

  const handleClick = useCallback(
    async (providerId: string) => {
      if (isLoading) return;

      setIsLoading(providerId);
      setError(null);
      void postTelemetry('login_provider_click', {
        provider: providerId,
        reason,
        src,
      });

      try {
        const result = await signIn(providerId, { callbackUrl });
        if (result?.error) throw new Error(result.error);
      } catch (signInError) {
        setIsLoading(null);
        setError(loginErrorMessage(signInError));
        void postTelemetry('login_error', {
          provider: providerId,
          reason,
          src,
          code: signInError instanceof Error ? signInError.message : 'unknown',
        });
      }
    },
    [callbackUrl, isLoading, reason, src]
  );

  if (providers.length === 0) {
    return (
      <div
        className="rounded-md border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200"
        role="status"
      >
        Sign-in is temporarily unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3" aria-busy={Boolean(isLoading)}>
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => handleClick(provider.id)}
            disabled={Boolean(isLoading)}
            className={`btn-primary ${className || 'px-4 py-2'} ${
              isLoading ? 'cursor-wait opacity-70' : ''
            }`}
            aria-label={provider.label}
            aria-describedby={error ? 'login-client-error' : undefined}
          >
            {isLoading === provider.id ? 'Connecting…' : provider.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error ? (
          <p
            id="login-client-error"
            className="text-sm text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
