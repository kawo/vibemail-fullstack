/**
 * Parses the engine's sign-in redirect (CONTRACT.md §4.1b):
 *
 *   signed in  /auth/callback?status=signed_in&initialSync=completed|failed
 *              #access_token=…&refresh_token=…&expires_in=…&expires_at=…&token_type=bearer
 *   any error  /auth/callback?status=error&code=<ErrorCode>[&reason=…]   (no fragment)
 *
 * The status is in the query; the session travels only in the fragment, which browsers never
 * send to a server.
 */
export interface CallbackTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch, when given. */
  expiresAt: number | null;
}

export type CallbackResult =
  | { ok: true; tokens: CallbackTokens; initialSync: 'completed' | 'failed' }
  | { ok: false; code: string; reason?: string };

export function parseCallback(search: string, hash: string): CallbackResult {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  if (query.get('status') !== 'signed_in') {
    const reason = query.get('reason');
    return { ok: false, code: query.get('code') ?? 'INTERNAL', ...(reason ? { reason } : {}) };
  }
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) {
    // Signed in, but the fragment was lost (e.g. the URL was copied without it).
    return { ok: false, code: 'UNAUTHENTICATED' };
  }
  const expiresAt = Number(fragment.get('expires_at'));
  return {
    ok: true,
    tokens: { accessToken, refreshToken, expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null },
    initialSync: query.get('initialSync') === 'failed' ? 'failed' : 'completed',
  };
}

/** Plain-language text for a sign-in failure `code` / `reason` from the redirect. */
export function signInMessage(code: string, reason?: string): string {
  if (code === 'GMAIL_NOT_CONNECTED') {
    return reason === 'access_denied'
      ? 'Sign-in was cancelled. VibeMail needs access to your Gmail to work.'
      : 'VibeMail needs every requested Gmail permission. Please sign in again and allow them all.';
  }
  if (code === 'UNAUTHENTICATED') {
    return 'That sign-in link expired. Please try again.';
  }
  if (code === 'GMAIL_RATE_LIMITED' || code === 'GMAIL_UPSTREAM_ERROR') {
    return 'Google is busy right now. Please try again in a moment.';
  }
  if (code === 'VALIDATION_FAILED' && reason === 'ANOTHER_GOOGLE_ACCOUNT_LINKED') {
    return 'Another Google account is already connected to this VibeMail account.';
  }
  if (code === 'VALIDATION_FAILED' && reason === 'GOOGLE_ACCOUNT_LINKED_ELSEWHERE') {
    return 'This Google account is already connected to a different VibeMail account.';
  }
  return 'Sign-in didn’t complete. Please try again.';
}
