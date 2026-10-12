'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { onApiSignal } from '@/services';
import { AuthGuard, INITIAL_SYNC_FAILED_KEY } from '@/components/auth/AuthGuard';
import { startSignIn } from '@/lib/auth/session';
import { ComposeProvider } from '@/components/compose/ComposeContext';
import { ComposeButton, InboxView } from '@/components/inbox';
import { Sidebar } from '@/components/sidebar';
import { ThreadView } from '@/components/thread';
import { Glyph, Toasts } from '@/components/ui';
import { syncPath, threadIdOf, usePath } from '@/lib/router';
import { startPreferences } from '@/state/preferences';
import { InboxUiProvider, useInboxUi } from '@/state/inboxUi';
import { store } from '@/state/store';

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

/** The thread, or (side by side only) a quiet prompt when none is open. */
function ReadingPane({ threadId }: { threadId: string | null }) {
  const pane = useRef<HTMLElement | null>(null);
  const { chip, searchActive } = useInboxUi();
  // Each thread opens at its top; the pane scrolls on its own when side by side.
  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [threadId]);
  return (
    <section ref={pane} className={`reading-pane${threadId === null ? ' empty-pane' : ''}`} aria-label="Conversation">
      {threadId !== null ? (
        <ThreadView key={threadId} threadId={threadId} />
      ) : (
        <p className="reading-empty">
          {chip.kind === 'drafts' && !searchActive ? 'Open a draft to keep writing it.' : 'Select a conversation to read it here.'}
        </p>
      )}
    </section>
  );
}

/**
 * The signed-in app (DESIGN_SPEC.md §1–§5): the sidebar, the list pane and the reading pane, the
 * phone's Compose button, toasts and the reconnect panel. It stays mounted across /inbox and
 * /thread/…, so the list keeps its paging and scroll; `children` (the route pages) render nothing.
 */
function Shell() {
  const nextPath = usePathname();
  useEffect(() => syncPath(nextPath), [nextPath]);
  const path = usePath();
  const [reconnect, setReconnect] = useState(false);

  useEffect(() => {
    startPreferences();
    try {
      if (window.sessionStorage.getItem(INITIAL_SYNC_FAILED_KEY)) {
        window.sessionStorage.removeItem(INITIAL_SYNC_FAILED_KEY);
        store.toast('Your first sync didn’t finish. New mail will still arrive as it comes in.', { ttl: 8000 });
      }
    } catch {
      // No session storage: no notice.
    }
    return onApiSignal((signal) => {
      if (signal === 'signed-out') {
        store.reset();
      } else {
        setReconnect(true);
      }
    });
  }, []);

  const threadId = threadIdOf(path);
  return (
    <>
      <div className="shell">
        <Sidebar />
        <main className="app">
          {/* From 1100px the open thread shows in the reading pane beside the list. Narrower,
              it replaces the list; the inbox stays mounted underneath, so its paging survives
              the round trip, and the router restores its scroll position. */}
          <InboxView covered={threadId !== null} />
          <ReadingPane threadId={threadId} />
        </main>
      </div>
      {/* Phones only: the sidebar is hidden there, so Compose also floats bottom-right. */}
      <ComposeButton />
      <Toasts />
      {reconnect && <ReconnectPanel onDismiss={() => setReconnect(false)} />}
    </>
  );
}

export function MailShell({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <ComposeProvider>
        <InboxUiProvider>
          <Shell />
          {children}
        </InboxUiProvider>
      </ComposeProvider>
    </AuthGuard>
  );
}
