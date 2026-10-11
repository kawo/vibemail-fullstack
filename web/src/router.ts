import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

/**
 * A minimal history router: `/`, `/thread/{threadId}` and `/auth/callback`.
 *
 * Moving between the inbox and a thread is animated: the inbox slides out to the left and the
 * thread slides in from the right, and the reverse on the way back (styles.css, "Screen
 * transitions"). Browsers with View Transitions animate both screens; others slide the incoming
 * screen only. Reduced motion turns it off. Each screen's scroll position is remembered, so going
 * back lands where the inbox was left.
 */

const listeners = new Set<() => void>();
const scrollByPath = new Map<string, number>();
let currentPath = typeof window === 'undefined' ? '/' : window.location.pathname;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isThreadPath(path: string): boolean {
  return threadIdOf(path) !== null;
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Commits the new path to React synchronously, then restores that screen's scroll. */
function commit(path: string): void {
  scrollByPath.set(currentPath, window.scrollY);
  currentPath = path;
  flushSync(() => {
    for (const listener of listeners) {
      listener();
    }
  });
  window.scrollTo(0, scrollByPath.get(path) ?? 0);
}

function transition(from: string, to: string, animate: boolean): void {
  const direction = isThreadPath(to) && !isThreadPath(from) ? 'forward' : !isThreadPath(to) && isThreadPath(from) ? 'back' : null;
  const root = document.documentElement;
  if (!animate || direction === null || reducedMotion()) {
    commit(to);
    return;
  }
  root.dataset.nav = direction;
  if (typeof document.startViewTransition === 'function') {
    const vt = document.startViewTransition(() => commit(to));
    void vt.finished.finally(() => {
      delete root.dataset.nav;
    });
    return;
  }
  // No View Transitions: slide the incoming screen in on its own.
  root.dataset.navFallback = direction;
  commit(to);
  window.setTimeout(() => {
    delete root.dataset.navFallback;
    delete root.dataset.nav;
  }, 320);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const next = window.location.pathname;
    if (next !== currentPath) {
      transition(currentPath, next, true);
    }
  });
}

export function navigate(path: string, options: { animate?: boolean } = {}): void {
  if (path !== window.location.pathname) {
    const from = currentPath;
    window.history.pushState(null, '', path);
    transition(from, path, options.animate !== false);
  }
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => currentPath);
}

/** The `threadId` of a `/thread/{threadId}` path, or null. */
export function threadIdOf(path: string): string | null {
  const match = /^\/thread\/([^/]+)\/?$/.exec(path);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
