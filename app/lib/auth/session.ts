import { GoTrueClient } from '@supabase/auth-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/app/lib/config';
import { type CallbackResult, type CallbackTokens, parseCallback } from './callback';

/**
 * The signed-in session: the Supabase session the sign-in callback hands over (CONTRACT.md
 * §4.1b), kept in localStorage and refreshed by the Supabase auth client. Every API call reads
 * its access token as the JWT bearer; the engine verifies it itself (§3.1).
 */
export interface AppSession {
  accessToken: string;
  email: string | null;
}

let client: GoTrueClient | null = null;

/**
 * Only Supabase Auth is needed (keep, refresh, sign out), so this uses the standalone client.
 * Null when NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing: there is then
 * no session, and the sign-in callback reports the failure instead of the app crashing.
 */
function supabase(): GoTrueClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).');
    return null;
  }
  if (!client) {
    client = new GoTrueClient({
      url: `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1`,
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      // The key supabase-js would use, so a session survives switching clients.
      storageKey: `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    });
  }
  return client;
}

const signedOutListeners = new Set<() => void>();

/** Called when the session ends: signed out, or refresh failed. */
export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

function signedOut(): void {
  for (const listener of signedOutListeners) {
    listener();
  }
}

export async function currentSession(): Promise<AppSession | null> {
  const auth = supabase();
  if (!auth) {
    return null;
  }
  const { data } = await auth.getSession();
  return data.session ? { accessToken: data.session.access_token, email: data.session.user.email ?? null } : null;
}

/**
 * Sign-in is a full-page navigation to the engine on this origin (CONTRACT.md §4.1a), which sends
 * the browser through Google and back to /auth/callback.
 */
export function startSignIn(): void {
  window.location.assign('/api/v1/auth/google');
}

async function store(tokens: CallbackTokens): Promise<void> {
  const auth = supabase();
  if (!auth) {
    throw new Error('Supabase auth is not configured');
  }
  const { error } = await auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  if (error) {
    throw error;
  }
}

/**
 * Handles /auth/callback: reads the status from the query and the session from the fragment,
 * clears the fragment from the address bar at once, and stores the session.
 */
export async function completeSignIn(location: Location = window.location): Promise<CallbackResult> {
  const result = parseCallback(location.search, location.hash);
  window.history.replaceState(null, '', location.pathname);
  if (!result.ok) {
    return result;
  }
  try {
    await store(result.tokens);
    return result;
  } catch {
    return { ok: false, code: 'UNAUTHENTICATED' };
  }
}

/** One silent refresh, used after an `UNAUTHENTICATED` response. Null when it fails. */
export async function refreshSession(): Promise<AppSession | null> {
  const auth = supabase();
  if (!auth) {
    return null;
  }
  const { data, error } = await auth.refreshSession();
  if (error || !data.session) {
    return null;
  }
  return { accessToken: data.session.access_token, email: data.session.user.email ?? null };
}

export async function signOut(): Promise<void> {
  await supabase()?.signOut({ scope: 'local' });
  signedOut();
}
