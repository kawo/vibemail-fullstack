import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { requireUser } from '../../src/middleware/auth';
import { createJwksResolver } from '../../src/middleware/jwks';

const SECRET = 'test-jwt-secret-at-least-32-characters!!';
const SUPABASE = 'https://proj.supabase.co';
const ISSUER = `${SUPABASE}/auth/v1`;
const USER = 'user-1';
const EMAIL = 'me@example.com';

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'ec-key-1';

function sign(key: string | KeyObject, options: jwt.SignOptions, claims: Record<string, unknown> = {}): string {
  return jwt.sign({ sub: USER, email: EMAIL, ...claims }, key, {
    audience: 'authenticated',
    issuer: ISSUER,
    expiresIn: '1h',
    ...options,
  });
}

const request = (token: string) => new Request('https://api.test/api/v1/messages', { headers: { Authorization: `Bearer ${token}` } });

/** Resolves KID to the EC public key; any other kid is unknown. */
const signingKeys = async (kid: string) => (kid === KID ? ec.publicKey : null);
const config = { jwtSecret: SECRET, supabaseUrl: SUPABASE, signingKeys };

async function rejection(token: string, cfg: Parameters<typeof requireUser>[1] = config) {
  return requireUser(request(token), cfg).then(
    () => 'accepted',
    (error: { code?: string }) => error.code,
  );
}

describe('requireUser (CONTRACT.md §3.1)', () => {
  it('accepts an HS256 token signed with JWT_SECRET', async () => {
    await expect(requireUser(request(sign(SECRET, { algorithm: 'HS256' })), config)).resolves.toEqual({ userId: USER, email: EMAIL });
  });

  it('accepts an ES256 token signed by a key in the project JWKS', async () => {
    const token = sign(ec.privateKey, { algorithm: 'ES256', keyid: KID });
    await expect(requireUser(request(token), config)).resolves.toEqual({ userId: USER, email: EMAIL });
  });

  it.each([
    ['an unknown kid', () => sign(ec.privateKey, { algorithm: 'ES256', keyid: 'other' })],
    ['no kid', () => sign(ec.privateKey, { algorithm: 'ES256' })],
    ['a key outside the JWKS', () => sign(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey, { algorithm: 'ES256', keyid: KID })],
    ['the wrong audience', () => sign(ec.privateKey, { algorithm: 'ES256', keyid: KID, audience: 'anon' })],
    ['the wrong issuer', () => sign(ec.privateKey, { algorithm: 'ES256', keyid: KID, issuer: 'https://evil.example/auth/v1' })],
    ['an expired token', () => sign(ec.privateKey, { algorithm: 'ES256', keyid: KID, expiresIn: -10 })],
    ['RS256 claiming the EC key', () => sign(rsa.privateKey, { algorithm: 'RS256', keyid: KID })],
    ['HS512', () => sign(SECRET, { algorithm: 'HS512' })],
  ])('rejects an asymmetric or unexpected token with %s', async (_name, token) => {
    await expect(rejection(token())).resolves.toBe('UNAUTHENTICATED');
  });

  it('rejects HS256 signed with the public key as the secret (algorithm confusion)', async () => {
    const pem = ec.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const forged = jwt.sign({ sub: USER, email: EMAIL }, pem, { algorithm: 'HS256', audience: 'authenticated', issuer: ISSUER, keyid: KID, allowInsecureKeySizes: true });
    await expect(rejection(forged)).resolves.toBe('UNAUTHENTICATED');
  });

  it('rejects an asymmetric token when no key resolver is configured', async () => {
    const token = sign(ec.privateKey, { algorithm: 'ES256', keyid: KID });
    await expect(rejection(token, { jwtSecret: SECRET, supabaseUrl: SUPABASE })).resolves.toBe('UNAUTHENTICATED');
  });

  it('lets a key lookup failure through as a server error, not UNAUTHENTICATED', async () => {
    const token = sign(ec.privateKey, { algorithm: 'ES256', keyid: KID });
    const failing = { ...config, signingKeys: async () => Promise.reject(new Error('JWKS fetch failed')) };
    await expect(rejection(token, failing)).resolves.toBeUndefined();
  });
});

describe('createJwksResolver', () => {
  const jwk = (key: KeyObject, kid: string) => ({ ...key.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' });
  const second = generateKeyPairSync('ec', { namedCurve: 'P-256' });

  function setup(bodies: unknown[]) {
    let clock = 0;
    const calls: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      calls.push(url);
      const body = bodies[Math.min(calls.length - 1, bodies.length - 1)];
      return body instanceof Error ? Promise.reject(body) : new Response(JSON.stringify(body), { status: 200 });
    });
    const resolve = createJwksResolver(`${SUPABASE}/`, { fetch: fetchImpl as unknown as typeof fetch, now: () => clock });
    return { resolve, calls, advance: (ms: number) => (clock += ms) };
  }

  it('fetches the project JWKS once and caches the keys', async () => {
    const { resolve, calls } = setup([{ keys: [jwk(ec.publicKey, KID)] }]);
    const key = await resolve(KID);
    expect(key?.asymmetricKeyType).toBe('ec');
    await resolve(KID);
    expect(calls).toEqual([`${SUPABASE}/auth/v1/.well-known/jwks.json`]);
  });

  it('refetches for an unknown kid, but at most once per 30 seconds', async () => {
    const { resolve, calls, advance } = setup([{ keys: [jwk(ec.publicKey, KID)] }, { keys: [jwk(ec.publicKey, KID), jwk(second.publicKey, 'k2')] }]);
    await resolve(KID);
    advance(1_000);
    await expect(resolve('k2')).resolves.toBeNull();
    expect(calls).toHaveLength(1);
    advance(30_000);
    expect((await resolve('k2'))?.asymmetricKeyType).toBe('ec');
    expect(calls).toHaveLength(2);
  });

  it('refreshes after 10 minutes, and keeps the cached keys if that refresh fails', async () => {
    const { resolve, calls, advance } = setup([{ keys: [jwk(ec.publicKey, KID)] }, new Error('network down')]);
    await resolve(KID);
    advance(10 * 60_000 + 1);
    expect((await resolve(KID))?.asymmetricKeyType).toBe('ec');
    expect(calls).toHaveLength(2);
  });

  it('throws when the first fetch fails, so the request is a 500 and the session survives', async () => {
    const { resolve } = setup([new Error('network down')]);
    await expect(resolve(KID)).rejects.toThrow();
  });

  it('ignores symmetric and unusable entries', async () => {
    const { resolve } = setup([{ keys: [{ kty: 'oct', k: 'c2VjcmV0', kid: 'sym' }, { kty: 'EC', kid: 'broken' }, jwk(ec.publicKey, KID)] }]);
    await expect(resolve('sym')).resolves.toBeNull();
    await expect(resolve('broken')).resolves.toBeNull();
    expect((await resolve(KID))?.asymmetricKeyType).toBe('ec');
  });
});
