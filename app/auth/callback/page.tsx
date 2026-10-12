'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { completeSignIn } from '@/lib/auth/session';
import { INITIAL_SYNC_FAILED_KEY } from '@/components/auth/AuthGuard';

/**
 * Where the engine's sign-in callback (api/v1/auth/google/callback.ts, CONTRACT.md §4.1b) sends
 * the browser. The status is in the query; the session's JWTs are only in the fragment. This
 * reads them, clears them from the address bar, stores the session and goes to the inbox; on an
 * error it returns to the sign-in card with the reason.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice in development; the fragment can only be read once.
    if (started.current) return;
    started.current = true;
    void completeSignIn().then((result) => {
      if (!result.ok) {
        const query = new URLSearchParams({ code: result.code, ...(result.reason ? { reason: result.reason } : {}) });
        router.replace(`/auth?${query.toString()}`);
        return;
      }
      if (result.initialSync === 'failed') {
        try {
          window.sessionStorage.setItem(INITIAL_SYNC_FAILED_KEY, '1');
        } catch {
          // The notice is a courtesy; carry on without it.
        }
      }
      router.replace('/inbox');
    });
  }, [router]);

  return (
    <AuthCard>
      <p className="hint" role="status">
        <span className="spinner" /> Signing you in…
      </p>
    </AuthCard>
  );
}
