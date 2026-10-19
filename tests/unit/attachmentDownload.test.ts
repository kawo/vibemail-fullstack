import jwt from 'jsonwebtoken';
import { toMessageRow } from '../../src/db/messages';
import type { AppDeps } from '../../src/http/deps';
import { createHandlers } from '../../src/http/handlers';
import { ProviderError } from '../../src/providers/provider';
import { createFakeProviderFactory, fakeMessage } from '../fakes/fakeProvider';
import { FakeSessions } from '../fakes/fakeSessions';
import { MemoryAttachmentStore, MemoryAttachments } from '../fakes/memoryAttachments';
import { MemoryMessages, MemoryUsers } from '../fakes/memoryRepos';

const SECRET = 'test-jwt-secret-at-least-32-characters!!';
const SUPABASE = 'https://proj.supabase.co';
const USER = 'user-1';
const now = new Date('2026-10-19T10:00:00.000Z');
const PDF = Buffer.from('%PDF-1.7 report');

const bearer = (sub = USER) =>
  jwt.sign({ sub, email: 'me@example.com' }, SECRET, { algorithm: 'HS256', audience: 'authenticated', issuer: `${SUPABASE}/auth/v1`, expiresIn: '1h' });

async function setup(options: { connected?: boolean; size?: number } = {}) {
  const { factory, box } = createFakeProviderFactory();
  const users = new MemoryUsers();
  if (options.connected !== false) {
    users.rows.set(USER, {
      googleId: 'g',
      userId: USER,
      email: 'me@example.com',
      scopes: [],
      credentials: { refreshToken: 'r', accessToken: null, accessTokenExpiresAt: null },
      historyId: '1',
      lastSyncedAt: now,
    });
  }
  const messages = new MemoryMessages();
  const attachments = [
    { partId: '1', filename: 'résumé "final".pdf', mimeType: 'application/pdf', size: options.size ?? PDF.length, attachmentId: 'stale-id' },
  ];
  await messages.upsertMessages(USER, [toMessageRow(USER, fakeMessage({ id: 'm1', attachments }), now)]);
  box.attachmentBytes.set('m1/1', PDF);
  const store = new MemoryAttachmentStore();
  const deps: AppDeps = {
    factory,
    users,
    messages,
    attachments: new MemoryAttachments(),
    attachmentStore: store,
    sessions: new FakeSessions({ userId: USER, email: 'me@example.com' }),
    jwtSecret: SECRET,
    supabaseUrl: SUPABASE,
    frontendUrl: 'https://app.vibemail.test',
    pubsubVerificationToken: undefined,
    cronSecret: undefined,
    waitUntil: () => undefined,
    now: () => now,
    log: () => undefined,
  };
  return { h: createHandlers(() => deps), box, store };
}

const get = (id: string, partId: string, token: string | null = bearer()) =>
  new Request(`https://api.test/api/v1/messages/${id}/attachments/${partId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;
}

describe('GET /api/v1/messages/{id}/attachments/{partId} (CONTRACT.md §4.15)', () => {
  it('copies the file from Gmail to Storage and returns a signed download', async () => {
    const { h, box, store } = await setup();
    const response = await h.downloadAttachment(get('m1', '1'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: `https://storage.test/object/sign/attachments/${USER}/received/m1/1?download=${encodeURIComponent('résumé "final".pdf')}`,
      expiresAt: '2026-10-19T10:05:00.000Z',
      filename: 'résumé "final".pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
    });
    expect(box.calls.map((c) => [c.method, c.args])).toEqual([['getAttachment', ['m1', '1']]]);
    expect(store.objects.get(`${USER}/received/m1/1`)).toEqual({ content: PDF, contentType: 'application/pdf' });
  });

  it('serves a second download from the Storage copy without reading Gmail', async () => {
    const { h, box } = await setup();
    await h.downloadAttachment(get('m1', '1'));
    box.forbidCalls = true;
    const response = await h.downloadAttachment(get('m1', '1'));
    expect(response.status).toBe(200);
  });

  it.each([
    ['an unknown message', 'm9', '1', {}],
    ['an attachment the message does not have', 'm1', '2', { partId: '2' }],
  ])('answers 404 MESSAGE_NOT_FOUND for %s, without reading Gmail', async (_name, id, partId, details) => {
    const { h, box } = await setup();
    box.forbidCalls = true;
    const response = await h.downloadAttachment(get(id, partId));
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe('MESSAGE_NOT_FOUND');
    if (Object.keys(details).length > 0) {
      expect(error.details).toEqual(details);
    }
  });

  it("treats another user's message as not found", async () => {
    const { h, box } = await setup();
    box.forbidCalls = true;
    const response = await h.downloadAttachment(get('m1', '1', bearer('user-2')));
    expect(response.status).toBe(404);
  });

  it('answers 413 FILE_TOO_LARGE over 25 MB, without reading Gmail', async () => {
    const { h, box } = await setup({ size: 26214401 });
    box.forbidCalls = true;
    const response = await h.downloadAttachment(get('m1', '1'));
    expect(response.status).toBe(413);
    expect(await errorOf(response)).toMatchObject({ code: 'FILE_TOO_LARGE', details: { maxBytes: 26214400, size: 26214401 } });
  });

  it.each([
    ['id', 'm-1', '1'],
    ['partId', 'm1', '1;x'],
    ['partId', 'm1', '.'],
  ])('rejects a malformed %s with 400', async (field, id, partId) => {
    const { h } = await setup();
    const response = await h.downloadAttachment(get(id, partId));
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [expect.objectContaining({ field })] } });
  });

  it('answers 404 when Gmail no longer has the part', async () => {
    const { h, box } = await setup();
    box.failNext.set('getAttachment', new ProviderError('not_found', 'gone'));
    const response = await h.downloadAttachment(get('m1', '1'));
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({ code: 'MESSAGE_NOT_FOUND', details: { partId: '1' } });
  });

  it('answers 409 GMAIL_NOT_CONNECTED when Gmail must be read but the account is not connected', async () => {
    const { h } = await setup({ connected: false });
    const response = await h.downloadAttachment(get('m1', '1'));
    expect(response.status).toBe(409);
  });

  it('needs a bearer token', async () => {
    const { h } = await setup();
    const response = await h.downloadAttachment(get('m1', '1', null));
    expect(response.status).toBe(401);
  });
});
