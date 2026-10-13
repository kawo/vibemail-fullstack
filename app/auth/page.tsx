'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthCard } from '@/app/components/auth/AuthCard';
import { signInMessage } from '@/app/lib/auth/callback';
import { currentSession, startSignIn } from '@/app/lib/auth/session';

/**
 * Sign in (CONTRACT.md §4.1): the glass card and "Sign in with Google". The button is a
 * full-page navigation to the engine's GET /api/v1/auth/google, which runs the OAuth flow and
 * comes back to /auth/callback. A failed sign-in lands here with `?code=` (and `?reason=`).
 * Already signed in, it goes straight to the inbox.
 */
function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const [checked, setChecked] = useState(false);
  const code = params.get('code');
  const error = code ? signInMessage(code, params.get('reason') ?? undefined) : null;

  useEffect(() => {
    let live = true;
    void currentSession().then((session) => {
      if (!live) return;
      if (session) {
        router.replace('/inbox');
      } else {
        setChecked(true);
      }
    });
    return () => {
      live = false;
    };
  }, [router]);

  if (!checked) {
    return null;
  }
  return (
    <AuthCard>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="button" className="primary-btn" onClick={startSignIn}>
        Sign in with Google
      </button>
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
