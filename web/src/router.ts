import { useSyncExternalStore } from 'react';

/** A minimal history router: `/`, `/thread/{threadId}` and `/auth/callback`. */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function navigate(path: string): void {
  if (path !== window.location.pathname) {
    window.history.pushState(null, '', path);
    for (const listener of listeners) {
      listener();
    }
  }
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
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
