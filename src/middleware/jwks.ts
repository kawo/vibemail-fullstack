import { type JsonWebKeyInput, type KeyObject, createPublicKey } from 'node:crypto';

type Jwk = JsonWebKeyInput['key'];

/** Public key for a token's `kid`, or null when the project has no such key (CONTRACT.md §3.1). */
export type SigningKeyResolver = (kid: string) => Promise<KeyObject | null>;

/** Cached keys are refreshed after this long. */
const TTL_MS = 10 * 60_000;
/** An unknown `kid` refetches the set at most this often, so forged kids can't flood Supabase. */
const MIN_REFETCH_MS = 30_000;

export interface JwksOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

/** Only asymmetric signing keys are usable; a symmetric (`oct`) entry must never become a key. */
function toKeys(body: unknown): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>();
  const entries = (body as { keys?: unknown } | null)?.keys;
  if (!Array.isArray(entries)) {
    throw new Error('JWKS response has no keys array');
  }
  for (const entry of entries as Array<Jwk & { kid?: unknown; use?: unknown }>) {
    if (typeof entry.kid !== 'string' || (entry.kty !== 'EC' && entry.kty !== 'RSA') || (entry.use !== undefined && entry.use !== 'sig')) {
      continue;
    }
    try {
      keys.set(entry.kid, createPublicKey({ key: entry, format: 'jwk' }));
    } catch {
      // A malformed entry is skipped; tokens naming it fail verification.
    }
  }
  return keys;
}

/**
 * Resolves Supabase's asymmetric signing keys from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 * Keys are cached per warm instance. A failed refresh keeps the cached keys; a failed first fetch
 * throws, so the request answers 500 rather than signing the user out with a 401.
 */
export function createJwksResolver(supabaseUrl: string, options: JwksOptions = {}): SigningKeyResolver {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const url = `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`;
  let keys: Map<string, KeyObject> | null = null;
  let fetchedAt = 0;
  let inFlight: Promise<void> | null = null;

  const refresh = (): Promise<void> => {
    inFlight ??= (async () => {
      try {
        const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`JWKS fetch failed with ${response.status}`);
        }
        keys = toKeys(await response.json());
      } catch (error) {
        if (!keys) {
          throw error;
        }
      } finally {
        fetchedAt = now();
        inFlight = null;
      }
    })();
    return inFlight;
  };

  return async (kid) => {
    const age = now() - fetchedAt;
    if (!keys || age > TTL_MS || (!keys.has(kid) && age >= MIN_REFETCH_MS)) {
      await refresh();
    }
    return keys?.get(kid) ?? null;
  };
}
