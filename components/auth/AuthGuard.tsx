'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { currentSession, onSignedOut } from '@/lib/auth/session';

/** Set by /auth/callback when the engine's first sync failed; the inbox shows a toast once. */
export const INITIAL_SYNC_FAILED_KEY = 'vibemail.initialSyncFailed';

/**
 * Keeps the mail screens for signed-in users: until the session is checked it renders nothing;
 * without one (or when it ends) it replaces the page with /auth.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'in'>('checking');

  useEffect(() => {
    let live = true;
    void currentSession().then((session) => {
      if (!live) return;
      if (session) {
        setState('in');
      } else {
        router.replace('/auth');
      }
    });
    const off = onSignedOut(() => router.replace('/auth'));
    return () => {
      live = false;
      off();
    };
  }, [router]);

  return state === 'in' ? <>{children}</> : null;
}
