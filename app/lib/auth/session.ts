import { GoTrueClient } from '@supabase/auth-js';
import { SAMPLE_ACCOUNT } from '@/data/data';
import { API_URL, DATA_SOURCE, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/app/lib/config';
import { type CallbackResult, type CallbackTokens, jwtClaims, parseCallback } from './callback';

export { API_URL };

/**
 * The signed-in session. With the engine (`api`), it is the Supabase session the sign-in
 * callback hands over (CONTRACT.md §4.1b), kept and refreshed by the Supabase auth client; the
 * engine verifies the access token itself. With the sample data, it is a local stand-in with
 * the same shape, so the sign-in, callback and guard run without a backend.
 */
export interface AppSession {
  accessToken: string;
  email: string | null;
}

let client: GoTrueClient | null = null;

/** Only Supabase Auth is needed (keep, refresh, sign out), so this uses the standalone client. */
function supabase(): GoTrueClient {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see app/.env.example).');
    }
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

// ---- Sample mode: the session is the token from the callback URL, kept in localStorage. ----

const SAMPLE_KEY = 'vibemail.sample.session';

function readSample(): AppSession | null {
  try {
    const raw = window.localStorage.getItem(SAMPLE_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<AppSession>) : null;
    return value && typeof value.accessToken === 'string' ? { accessToken: value.accessToken, email: value.email ?? null } : null;
  } catch {
    return null;
  }
}

function writeSample(session: AppSession | null): void {
  try {
    if (session) {
      window.localStorage.setItem(SAMPLE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SAMPLE_KEY);
    }
  } catch {
    // Storage unavailable: the session lasts for this page only.
  }
}

/** An unsigned JWT-shaped token for sample mode; nothing verifies it, the app only reads its claims. */
function sampleToken(): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'sample-user', email: SAMPLE_ACCOUNT.email, aud: 'authenticated' })}.sample`;
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
  if (DATA_SOURCE === 'sample') {
    return readSample();
  }
  const { data } = await supabase().getSession();
  return data.session ? { accessToken: data.session.access_token, email: data.session.user.email ?? null } : null;
}

/**
 * Sign-in is a full-page navigation to the engine (CONTRACT.md §4.1a), which sends the browser
 * through Google and back to /auth/callback. In sample mode the button goes straight to
 * /auth/callback with a sample token in the fragment, the same shape the engine sends.
 */
export function startSignIn(): void {
  if (DATA_SOURCE === 'sample') {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    window.location.assign(
      `/auth/callback?status=signed_in&initialSync=completed#access_token=${sampleToken()}&refresh_token=sample&expires_in=3600&expires_at=${expiresAt}&token_type=bearer`,
    );
    return;
  }
  window.location.assign(`${API_URL}/api/v1/auth/google`);
}

async function store(tokens: CallbackTokens): Promise<void> {
  if (DATA_SOURCE === 'sample') {
    writeSample({ accessToken: tokens.accessToken, email: jwtClaims(tokens.accessToken)?.email ?? null });
    return;
  }
  const { error } = await supabase().setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
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
  if (DATA_SOURCE === 'sample') {
    return readSample();
  }
  const { data, error } = await supabase().refreshSession();
  if (error || !data.session) {
    return null;
  }
  return { accessToken: data.session.access_token, email: data.session.user.email ?? null };
}

export async function signOut(): Promise<void> {
  if (DATA_SOURCE === 'sample') {
    writeSample(null);
  } else {
    await supabase().signOut({ scope: 'local' });
  }
  signedOut();
}
