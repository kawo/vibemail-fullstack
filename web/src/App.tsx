import { useEffect, useState } from 'react';
import { onApiSignal } from './api/client';
import { auth as authClient, completeSignIn, currentSession, startSignIn } from './auth/session';
import { ComposeButton, InboxView } from './components/inbox';
import { ThreadView } from './components/thread';
import { Glyph, Toasts } from './components/ui';
import { ComposeProvider } from './compose/ComposeContext';
import { navigate, threadIdOf, usePath } from './router';
import { store } from './state/store';

type Auth = 'checking' | 'signed-in' | 'signed-out';

/** Plain-language text for a sign-in failure `code` / `reason` from the callback redirect. */
function signInMessage(code: string, reason?: string): string {
  if (code === 'GMAIL_NOT_CONNECTED') {
    return reason === 'access_denied'
      ? 'Sign-in was cancelled. VibeMail needs access to your Gmail to work.'
      : 'VibeMail needs every requested Gmail permission. Please sign in again and allow them all.';
  }
  if (code === 'UNAUTHENTICATED') {
    return 'That sign-in link expired. Please try again.';
  }
  if (code === 'GMAIL_RATE_LIMITED' || code === 'GMAIL_UPSTREAM_ERROR') {
    return 'Google is busy right now. Please try again in a moment.';
  }
  if (code === 'VALIDATION_FAILED' && reason === 'ANOTHER_GOOGLE_ACCOUNT_LINKED') {
    return 'Another Google account is already connected to this VibeMail account.';
  }
  if (code === 'VALIDATION_FAILED' && reason === 'GOOGLE_ACCOUNT_LINKED_ELSEWHERE') {
    return 'This Google account is already connected to a different VibeMail account.';
  }
  return 'Sign-in didn’t complete. Please try again.';
}

function SignIn({ error }: { error: string | null }) {
  return (
    <div className="signin">
      <div className="glass-raised panel">
        <h1>VibeMail</h1>
        <p>Your Gmail, liberated into a mailbox you own.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="button" className="primary-btn" onClick={startSignIn}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function ReconnectPanel({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="reconnect-title">
      <div className="glass-raised panel">
        <Glyph name="alert" className="mark" />
        <h2 id="reconnect-title">Reconnect Gmail</h2>
        <p>VibeMail lost access to your Gmail. Sign in with Google again to pick up where you left off.</p>
        <button type="button" className="primary-btn" onClick={startSignIn}>
          Reconnect Gmail
        </button>
        <button type="button" className="secondary-btn" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

export function App() {
  const path = usePath();
  const [auth, setAuth] = useState<Auth>('checking');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [reconnect, setReconnect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (window.location.pathname === '/auth/callback') {
        const result = await completeSignIn();
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setSignInError(signInMessage(result.code ?? 'INTERNAL', result.reason));
          setAuth('signed-out');
          return;
        }
        if (result.initialSync === 'failed') {
          store.toast('Your first sync didn’t finish. New mail will still arrive as it comes in.', { ttl: 8000 });
        }
        navigate('/', { animate: false });
        setAuth('signed-in');
        return;
      }
      const session = await currentSession();
      if (!cancelled) {
        setAuth(session ? 'signed-in' : 'signed-out');
      }
    };
    void start();
    const { data } = authClient().onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setAuth('signed-out');
      }
    });
    const off = onApiSignal((signal) => {
      if (signal === 'signed-out') {
        store.reset();
        setAuth('signed-out');
      } else {
        setReconnect(true);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
      off();
    };
  }, []);

  if (auth === 'checking') {
    return null;
  }
  if (auth === 'signed-out') {
    return <SignIn error={signInError} />;
  }

  const threadId = threadIdOf(path);
  return (
    <ComposeProvider>
      <main className="app">
        {/* A thread replaces the inbox. The inbox stays mounted underneath, so its chip and
            search survive the round trip; the router restores its scroll position. */}
        <InboxView covered={threadId !== null} />
        {threadId !== null && <ThreadView key={threadId} threadId={threadId} />}
      </main>
      <ComposeButton />
      <Toasts />
      {reconnect && <ReconnectPanel onDismiss={() => setReconnect(false)} />}
    </ComposeProvider>
  );
}
