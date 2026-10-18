import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/app/lib/config', () => ({ SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon' }));
vi.mock('@supabase/auth-js', () => ({
  GoTrueClient: class {
    signOut = auth.signOut;
  },
}));

import { onSignedOut, signInPath, signOut } from '@/app/lib/auth/session';

const KEY = 'sb-proj-auth-token';
let storage: Map<string, string>;
let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  storage = new Map([
    [KEY, '{"access_token":"jwt"}'],
    [`${KEY}-user`, '{}'],
    ['vibemail.other', 'kept'],
  ]);
  replace = vi.fn();
  vi.stubGlobal('window', {
    location: { replace },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
  });
  auth.signOut.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('signOut', () => {
  it('on an explicit sign-out: ends the Supabase session locally, clears the stored JWT and goes to /auth', async () => {
    const listener = vi.fn();
    const off = onSignedOut(listener);
    await signOut();
    off();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect([...storage.keys()]).toEqual(['vibemail.other']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/auth');
  });

  it('after a 401: sends the user to the sign-in page with the session-expired reason', async () => {
    await signOut('expired');
    expect(replace).toHaveBeenCalledWith('/auth?code=UNAUTHENTICATED&reason=SESSION_EXPIRED');
    expect(storage.has(KEY)).toBe(false);
  });

  it('still clears the JWT and redirects when Supabase sign-out fails', async () => {
    auth.signOut.mockRejectedValue(new Error('network down'));
    await signOut('expired');
    expect(storage.has(KEY)).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);

    auth.signOut.mockResolvedValue({ error: new Error('server said no') });
    storage.set(KEY, 'jwt');
    await signOut();
    expect(storage.has(KEY)).toBe(false);
  });

  it('signs out once when several calls fail with 401 together', async () => {
    await Promise.all([signOut('expired'), signOut('expired'), signOut('expired')]);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('builds the sign-in path for each reason', () => {
    expect(signInPath('user')).toBe('/auth');
    expect(signInPath('expired')).toBe('/auth?code=UNAUTHENTICATED&reason=SESSION_EXPIRED');
  });
});
