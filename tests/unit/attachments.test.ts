import jwt from 'jsonwebtoken';
import type { AppDeps } from '../../src/http/deps';
import { createHandlers } from '../../src/http/handlers';
import { createFakeProviderFactory } from '../fakes/fakeProvider';
import { FakeSessions } from '../fakes/fakeSessions';
import { MemoryAttachmentStore, MemoryAttachments } from '../fakes/memoryAttachments';
import { MemoryMessages, MemoryUsers } from '../fakes/memoryRepos';

const SECRET = 'test-jwt-secret-at-least-32-characters!!';
const SUPABASE = 'https://proj.supabase.co';
const USER = 'user-1';
const ID = '11111111-2222-4333-8444-555555555555';
const now = new Date('2026-10-18T10:00:00.000Z');

const bearer = () =>
  jwt.sign({ sub: USER, email: 'me@example.com' }, SECRET, { algorithm: 'HS256', audience: 'authenticated', issuer: `${SUPABASE}/auth/v1`, expiresIn: '1h' });

function setup() {
  const { factory, box } = createFakeProviderFactory();
  box.forbidCalls = true; // Reserving an upload never touches Gmail.
  const attachments = new MemoryAttachments();
  const store = new MemoryAttachmentStore();
  const deps: AppDeps = {
    factory,
    users: new MemoryUsers(),
    messages: new MemoryMessages(),
    attachments,
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
    newId: () => ID,
  };
  return { h: createHandlers(() => deps), attachments, store };
}

const post = (body: unknown, token: string | null = bearer()) =>
  new Request('https://api.test/api/v1/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const valid = { filename: 'report.pdf', mimeType: 'application/pdf', size: 1024 };

describe('POST /api/v1/attachments (CONTRACT.md §4.14)', () => {
  it('reserves the upload and returns the attachment with a signed upload', async () => {
    const { h, attachments, store } = setup();
    const response = await h.reserveAttachment(post(valid));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      attachment: { attachmentId: ID, filename: 'report.pdf', mimeType: 'application/pdf', size: 1024, createdAt: '2026-10-18T10:00:00.000Z' },
      upload: {
        url: `https://storage.test/object/upload/sign/attachments/${USER}/${ID}?token=t`,
        method: 'PUT',
        headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
        expiresAt: '2026-10-18T12:00:00.000Z',
      },
    });
    expect(attachments.rows.get(ID)).toMatchObject({ userId: USER, storagePath: `${USER}/${ID}` });
    expect(store.signed).toEqual([`${USER}/${ID}`]);
  });

  it('trims the filename', async () => {
    const { h, attachments } = setup();
    await h.reserveAttachment(post({ ...valid, filename: '  report.pdf ' }));
    expect(attachments.rows.get(ID)?.filename).toBe('report.pdf');
  });

  it.each([
    ['filename', { filename: '   ' }],
    ['filename', { filename: 'a'.repeat(256) }],
    ['filename', { filename: 'dir/report.pdf' }],
    ['filename', { filename: 'dir\\report.pdf' }],
    ['filename', { filename: 'bell\u0007.pdf' }],
    ['filename', { filename: 42 }],
    ['mimeType', { mimeType: 'pdf' }],
    ['mimeType', { mimeType: 'text/plain; charset=utf-8' }],
    ['size', { size: 0 }],
    ['size', { size: 1.5 }],
    ['size', { size: '10' }],
  ])('rejects a bad %s with 400 VALIDATION_FAILED', async (field, change) => {
    const { h, attachments } = setup();
    const response = await h.reserveAttachment(post({ ...valid, ...change }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; details: { field: string } } };
    expect(body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { field } });
    expect(attachments.rows.size).toBe(0);
  });

  it('rejects a body that is not JSON', async () => {
    const { h } = setup();
    const response = await h.reserveAttachment(post('{nope'));
    expect(response.status).toBe(400);
  });

  it('answers 413 FILE_TOO_LARGE over 25 MB, without reserving anything', async () => {
    const { h, attachments, store } = setup();
    const response = await h.reserveAttachment(post({ ...valid, size: 26214401 }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FILE_TOO_LARGE', retryable: false, details: { maxBytes: 26214400, size: 26214401 } },
    });
    expect(attachments.rows.size).toBe(0);
    expect(store.signed).toEqual([]);
  });

  it('accepts exactly 25 MB', async () => {
    const { h } = setup();
    const response = await h.reserveAttachment(post({ ...valid, size: 26214400 }));
    expect(response.status).toBe(201);
  });

  it('deletes the row and answers 500 INTERNAL when the signed URL fails', async () => {
    const { h, attachments, store } = setup();
    store.failCreate = true;
    const response = await h.reserveAttachment(post(valid));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'INTERNAL' } });
    expect(attachments.rows.size).toBe(0);
  });

  it('needs a bearer token', async () => {
    const { h } = setup();
    const response = await h.reserveAttachment(post(valid, null));
    expect(response.status).toBe(401);
  });
});
