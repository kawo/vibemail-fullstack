import { describe, expect, it } from 'vitest';
import { jwtClaims, parseCallback, signInMessage } from '../callback';

describe('sign-in callback (CONTRACT.md §4.1b)', () => {
  it('reads the status from the query and the session from the fragment', () => {
    const result = parseCallback(
      '?status=signed_in&initialSync=failed',
      '#access_token=aaa.bbb.ccc&refresh_token=rrr&expires_in=3600&expires_at=1791800000&token_type=bearer',
    );
    expect(result).toEqual({ ok: true, tokens: { accessToken: 'aaa.bbb.ccc', refreshToken: 'rrr', expiresAt: 1791800000 }, initialSync: 'failed' });
  });

  it('turns an error redirect into its code and reason', () => {
    expect(parseCallback('?status=error&code=GMAIL_NOT_CONNECTED&reason=access_denied', '')).toEqual({
      ok: false,
      code: 'GMAIL_NOT_CONNECTED',
      reason: 'access_denied',
    });
    expect(signInMessage('GMAIL_NOT_CONNECTED', 'access_denied')).toMatch(/cancelled/);
  });

  it('treats a signed-in redirect without its fragment as expired', () => {
    expect(parseCallback('?status=signed_in', '')).toEqual({ ok: false, code: 'UNAUTHENTICATED' });
  });

  it('reads sub and email from a JWT payload, and ignores garbage', () => {
    const payload = btoa(JSON.stringify({ sub: 'u1', email: 'you@vibemail.example' })).replace(/=+$/, '');
    expect(jwtClaims(`h.${payload}.s`)).toEqual({ sub: 'u1', email: 'you@vibemail.example' });
    expect(jwtClaims('not-a-jwt')).toBeNull();
  });
});
