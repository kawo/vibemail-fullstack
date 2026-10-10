import { GoTrueClient, type Session } from '@supabase/auth-js';

/**
 * The Supabase session handed over by the engine's sign-in callback (CONTRACT.md §4.1b). The
 * engine verifies access tokens itself; the frontend keeps the session and refreshes it.
 */

export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let client: GoTrueClient | null = null;

/**
 * Only Supabase Auth is needed (keep, refresh and sign out the session), so this uses the
 * standalone auth client rather than the full supabase-js bundle.
 */
export function auth(): GoTrueClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see web/.env.example).');
    }
    client = new GoTrueClient({
      url: `${url.replace(/\/$/, '')}/auth/v1`,
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      // The key supabase-js would use, so a session survives switching clients.
      storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    });
  }
  return client;
}

/** Sign-in is a full-page navigation to the engine (CONTRACT.md §4.1a). */
export function startSignIn(): void {
  window.location.assign(`${API_URL}/api/v1/auth/google`);
}

export interface CallbackResult {
  ok: boolean;
  /** `initialSync` from the redirect, when signed in. */
  initialSync?: 'completed' | 'failed';
  /** `code` (and `reason`) from the redirect, on error. */
  code?: string;
  reason?: string;
}

/**
 * Handles `/auth/callback`: the status is in the query, the session only in the fragment. The
 * fragment is cleared with `history.replaceState` straight after it is read.
 */
export async function completeSignIn(location: Location = window.location): Promise<CallbackResult> {
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  window.history.replaceState(null, '', '/');
  if (query.get('status') !== 'signed_in') {
    return { ok: false, code: query.get('code') ?? 'INTERNAL', ...(query.get('reason') ? { reason: query.get('reason') ?? '' } : {}) };
  }
  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (!access_token || !refresh_token) {
    return { ok: false, code: 'UNAUTHENTICATED' };
  }
  const { error } = await auth().setSession({ access_token, refresh_token });
  if (error) {
    return { ok: false, code: 'UNAUTHENTICATED' };
  }
  return { ok: true, initialSync: query.get('initialSync') === 'failed' ? 'failed' : 'completed' };
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await auth().getSession();
  return data.session;
}

/** One silent refresh, used after an `UNAUTHENTICATED` response. Null when it fails. */
export async function refreshSession(): Promise<Session | null> {
  const { data, error } = await auth().refreshSession();
  return error ? null : data.session;
}

export async function signOut(): Promise<void> {
  await auth().signOut({ scope: 'local' });
}
