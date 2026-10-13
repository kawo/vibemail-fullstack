import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { SPLIT, matches } from '@/app/lib/breakpoints';

/**
 * In-app navigation between `/inbox` and `/thread/{threadId}` inside the mail layout
 * (app/(mail)/layout.tsx). It moves with the History API, which Next.js's App Router stays in
 * step with, so the shell (sidebar, list, reading pane) stays mounted and nothing refetches; both
 * routes exist as Next pages too, so a reload or a shared link lands on the same screen.
 *
 * Below 1100px a thread replaces the inbox, animated: the inbox slides out to the left and the
 * thread slides in from the right, and the reverse on the way back (styles.css, "Screen
 * transitions"). Browsers with View Transitions animate both screens; others slide the incoming
 * screen only. Reduced motion turns it off. Each screen's scroll position is remembered, so going
 * back lands where the inbox was left.
 *
 * From 1100px the thread opens in the reading pane beside the list: nothing slides, and the
 * list keeps its scroll position.
 */

const listeners = new Set<() => void>();
const scrollByPath = new Map<string, number>();
/** The inbox's path (the list, with `?label=` and `?q=`). */
export const INBOX_PATH = '/inbox';

let currentPath = typeof window === 'undefined' ? INBOX_PATH : window.location.pathname;

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
  // Side by side, the list stays on screen: its scroll belongs to it, not to the route.
  const split = matches(SPLIT);
  if (!split) {
    scrollByPath.set(currentPath, window.scrollY);
  }
  currentPath = path;
  flushSync(() => {
    for (const listener of listeners) {
      listener();
    }
  });
  if (!split) {
    window.scrollTo(0, scrollByPath.get(path) ?? 0);
  }
}

function transition(from: string, to: string, animate: boolean): void {
  const direction = isThreadPath(to) && !isThreadPath(from) ? 'forward' : !isThreadPath(to) && isThreadPath(from) ? 'back' : null;
  const root = document.documentElement;
  if (!animate || direction === null || reducedMotion() || matches(SPLIT)) {
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
    // Back on the inbox, keep its label and search in the address (InboxUiProvider writes them).
    window.history.pushState(null, '', path === INBOX_PATH ? `${path}${inboxQuery}` : path);
    transition(from, path, options.animate !== false);
  }
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => currentPath, () => INBOX_PATH);
}

/**
 * Follows navigations Next.js makes itself (a redirect into the app, router.replace): the path
 * this router holds is set when its module loads, which can be before Next has moved the URL.
 */
export function syncPath(path: string): void {
  if (path !== currentPath) {
    currentPath = path;
    for (const listener of listeners) {
      listener();
    }
  }
}

/** The inbox's `?label=…&q=…`, remembered while a thread is open so Back restores it. */
let inboxQuery = '';

export function setInboxQuery(query: string): void {
  inboxQuery = query;
  if (currentPath === INBOX_PATH && typeof window !== 'undefined' && window.location.search !== query) {
    window.history.replaceState(null, '', `${INBOX_PATH}${query}`);
  }
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
