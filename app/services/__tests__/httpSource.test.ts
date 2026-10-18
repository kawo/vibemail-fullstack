import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  currentSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/app/lib/auth/session', () => session);

import { httpSource } from '@/app/services/httpSource';
import { ApiError, onApiSignal } from '@/app/services/errors';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const unauthenticated = () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'missing bearer token', retryable: false } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  session.currentSession.mockResolvedValue({ accessToken: 'tok', email: 'me@example.com' });
  session.refreshSession.mockResolvedValue(null);
  session.signOut.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('httpSource (CONTRACT.md §3.1, §4)', () => {
  it('calls the engine over a relative path with the bearer and the label filter', async () => {
    fetchMock.mockResolvedValue(json(200, { messages: [], nextCursor: null, lastSyncedAt: null }));
    await httpSource.listMessages('archive', 'c1', 25);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/messages?limit=25&cursor=c1&label=archive');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('never sends a draftId in a draft body', async () => {
    fetchMock.mockImplementation(async () => json(201, { draft: {} }));
    await httpSource.createDraft({ to: [], subject: '', body: '' });
    await httpSource.updateDraft('d1', { to: ['a@b.c'], subject: 's', body: 'b' });
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(Object.keys(JSON.parse(String(init.body)))).not.toContain('draftId');
    }
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/v1/drafts/d1');
  });

  it('reserves an attachment upload with the bearer (§4.14)', async () => {
    fetchMock.mockResolvedValue(json(201, { attachment: { attachmentId: 'a1' }, upload: { url: 'u' } }));
    const result = await httpSource.reserveAttachment({ filename: 'a.pdf', mimeType: 'application/pdf', size: 3 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/attachments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ filename: 'a.pdf', mimeType: 'application/pdf', size: 3 });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    expect(result.attachment.attachmentId).toBe('a1');
  });

  it('sends attachmentIds with the message (§4.3)', async () => {
    fetchMock.mockResolvedValue(json(201, { message: {} }));
    await httpSource.send({ to: ['a@b.c'], subject: 's', body: 'b', attachmentIds: ['a1', 'a2'] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).attachmentIds).toEqual(['a1', 'a2']);
  });

  it('without a session: no bearer, one refresh attempt, then sign out', async () => {
    session.currentSession.mockResolvedValue(null);
    fetchMock.mockResolvedValue(unauthenticated());
    const signals: string[] = [];
    const off = onApiSignal((s) => signals.push(s));
    const call = httpSource.listMessages('all');
    await expect(call).rejects.toBeInstanceOf(ApiError);
    await expect(call).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    off();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(session.refreshSession).toHaveBeenCalledTimes(1);
    expect(session.signOut).toHaveBeenCalledTimes(1);
    expect(session.signOut).toHaveBeenCalledWith('expired');
    expect(signals).toEqual(['signed-out']);
  });
});
