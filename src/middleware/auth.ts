import type { KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ApiError } from './errors';
import type { SigningKeyResolver } from './jwks';

/** The authenticated caller (CONTRACT.md §3.1). `userId` comes only from the token's `sub`. */
export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthConfig {
  jwtSecret: string;
  supabaseUrl: string;
  /** The project's asymmetric signing keys (JWKS). Without it only HS256 tokens are accepted. */
  signingKeys?: SigningKeyResolver;
}

const unauthenticated = (message: string) => new ApiError('UNAUTHENTICATED', message);

/**
 * Picks the key from the token's header and pins the allowed algorithm to that key, never to the
 * header alone: HS256 is checked only with JWT_SECRET, ES256/RS256 only with the JWKS key of the
 * token's `kid` and the algorithm of that key's type. This blocks `alg: none` and algorithm
 * confusion (a public key used as an HMAC secret).
 */
async function keyFor(token: string, config: AuthConfig): Promise<{ key: string | KeyObject; algorithms: jwt.Algorithm[] }> {
  const header = jwt.decode(token, { complete: true })?.header;
  if (header?.alg === 'HS256') {
    return { key: config.jwtSecret, algorithms: ['HS256'] };
  }
  if ((header?.alg === 'ES256' || header?.alg === 'RS256') && header.kid && config.signingKeys) {
    // A failed key fetch propagates (→ 500), so an outage doesn't sign everyone out.
    const key = await config.signingKeys(header.kid);
    if (key?.asymmetricKeyType === 'ec') {
      return { key, algorithms: ['ES256'] };
    }
    if (key?.asymmetricKeyType === 'rsa') {
      return { key, algorithms: ['RS256'] };
    }
  }
  throw unauthenticated('invalid or expired bearer token');
}

/**
 * Verifies `Authorization: Bearer <Supabase access token>` locally: a legacy HS256 token with
 * JWT_SECRET, or an ES256/RS256 token with the project's published signing key; audience
 * `authenticated`, issuer `${SUPABASE_URL}/auth/v1`, and expiry.
 */
export async function requireUser(request: Request, config: AuthConfig): Promise<AuthUser> {
  const header = request.headers.get('authorization');
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  if (!match?.[1]) {
    throw unauthenticated('missing bearer token');
  }
  const token = match[1];
  const { key, algorithms } = await keyFor(token, config);
  let claims: string | jwt.JwtPayload;
  try {
    claims = jwt.verify(token, key, {
      algorithms,
      audience: 'authenticated',
      issuer: `${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1`,
    });
  } catch {
    throw unauthenticated('invalid or expired bearer token');
  }
  if (typeof claims === 'string' || typeof claims.sub !== 'string' || !claims.sub) {
    throw unauthenticated('token has no subject');
  }
  const email = (claims as { email?: unknown }).email;
  if (typeof email !== 'string' || !email) {
    throw unauthenticated('token has no email');
  }
  return { userId: claims.sub, email };
}
