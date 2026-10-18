/**
 * CONTRACT.md v1.1 endpoints (§4.7–§4.12) through the real handlers, with in-memory repositories
 * and the fake provider. Every `error.code` in their error tables has a test here (§2 criterion 2).
 */
import jwt from 'jsonwebtoken';
import type { AppDeps } from '../../src/http/deps';
import { type Handlers, createHandlers } from '../../src/http/handlers';
import { toMessageRow } from '../../src/db/messages';
import { ProviderError } from '../../src/providers/provider';
import { createFakeProviderFactory, fakeMessage } from '../fakes/fakeProvider';
import { FakeSessions } from '../fakes/fakeSessions';
import { MemoryMessages, MemoryUsers } from '../fakes/memoryRepos';
import { MemoryAttachmentStore, MemoryAttachments } from '../fakes/memoryAttachments';

const SECRET = 'test-jwt-secret-at-least-32-characters!!';
const SUPABASE = 'https://proj.supabase.co';
const FRONTEND = 'https://app.vibemail.test';
const USER = 'user-1';
const OTHER = 'user-2';
const EMAIL = 'me@example.com';
const now = new Date('2026-10-10T10:00:00.000Z');

const bearer = (sub = USER) =>
  jwt.sign({ sub, email: EMAIL }, SECRET, {
    algorithm: 'HS256',
    audience: 'authenticated',
    issuer: `${SUPABASE}/auth/v1`,
    expiresIn: '1h',
  });

function setup(connected = true) {
  const { factory, box } = createFakeProviderFactory();
  const users = new MemoryUsers();
  const connect = (userId: string, email: string) =>
    users.rows.set(userId, {
      googleId: `google-${userId}`,
      userId,
      email,
      scopes: [],
      credentials: { refreshToken: 'r', accessToken: null, accessTokenExpiresAt: null },
      historyId: '1',
      lastSyncedAt: now,
    });
  if (connected) {
    connect(USER, EMAIL);
  }
  const messages = new MemoryMessages();
  const deps: AppDeps = {
    factory,
    users,
    messages,
    sessions: new FakeSessions({ userId: USER, email: EMAIL }),
    attachments: new MemoryAttachments(),
    attachmentStore: new MemoryAttachmentStore(),
    jwtSecret: SECRET,
    supabaseUrl: SUPABASE,
    frontendUrl: FRONTEND,
    pubsubVerificationToken: 't'.repeat(32),
    cronSecret: 'c'.repeat(32),
    waitUntil: () => undefined,
    now: () => now,
    log: jest.fn(),
  };
  /** Stores a message in the DB and in the fake Gmail mailbox. */
  const store = async (
    id: string,
    options: { labels?: string[]; threadId?: string; minute?: number; userId?: string; subject?: string; body?: string } = {},
  ) => {
    const message = fakeMessage({
      id,
      labels: options.labels ?? ['INBOX', 'UNREAD'],
      threadId: options.threadId ?? id,
      receivedAt: new Date(Date.UTC(2026, 9, 1, 0, options.minute ?? 0)),
      subject: options.subject ?? 'Subject',
      bodyText: options.body ?? 'Body',
    });
    box.messages.set(id, message);
    const userId = options.userId ?? USER;
    await messages.upsertMessages(userId, [toMessageRow(userId, message, now)]);
  };
  return { h: createHandlers(() => deps), deps, box, users, messages, store, connect };
}

const request = (method: string, path: string, body?: unknown, token: string | undefined = bearer()) =>
  new Request(`https://api.vibemail.test${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; retryable: boolean; details?: Record<string, unknown> } })
    .error;
}

describe('PATCH /api/v1/messages/{id} (§4.7)', () => {
  const patch = (h: Handlers, id: string, body: unknown, token?: string) =>
    h.updateLabels(request('PATCH', `/api/v1/messages/${id}`, body, token));

  it.each([
    ['star', { addLabelIds: ['STARRED'] }, { isStarred: true, status: 'inbox' }],
    ['mark unread', { addLabelIds: ['UNREAD'] }, { isRead: false, status: 'inbox' }],
    ['archive', { removeLabelIds: ['INBOX'] }, { status: 'archived' }],
    ['custom label', { addLabelIds: ['Label_12'] }, { status: 'inbox' }],
  ])('%s goes through messages.modify and returns the derived status', async (_name, body, expected) => {
    const { h, box, store, messages } = setup();
    await store('m1');
    const response = await patch(h, 'm1', body);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND);
    const { message } = (await response.json()) as { message: Record<string, unknown> };
    expect(message).toMatchObject({ gmailId: 'm1', ...expected });
    expect(box.calls.map((c) => c.method)).toEqual(['modifyLabels']);
    expect((await messages.getMessage(USER, 'm1'))?.status).toBe(expected.status);
  });

  it('routes adding TRASH to messages.trash and removing it to messages.untrash', async () => {
    const { h, box, store, messages } = setup();
    await store('m1');
    const trashed = (await (await patch(h, 'm1', { addLabelIds: ['TRASH'] })).json()) as { message: { status: string } };
    expect(trashed.message.status).toBe('trash');
    const restored = (await (await patch(h, 'm1', { removeLabelIds: ['TRASH'] })).json()) as { message: { status: string } };
    expect(restored.message.status).toBe('archived');
    expect(box.calls.map((c) => c.method)).toEqual(['trash', 'untrash']);
    expect((await messages.getMessage(USER, 'm1'))?.status).toBe('archived');
  });

  it('401 UNAUTHENTICATED without a bearer', async () => {
    const { h } = setup();
    const response = await patch(h, 'm1', { addLabelIds: ['STARRED'] }, '');
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toMatchObject({ code: 'UNAUTHENTICATED', retryable: false });
  });

  it.each([
    ['status (never client-set)', { status: 'archived' }],
    ['isStarred', { isStarred: true }],
    ['no labels', {}],
    ['empty arrays', { addLabelIds: [], removeLabelIds: [] }],
    ['a label in both arrays', { addLabelIds: ['STARRED'], removeLabelIds: ['STARRED'] }],
    ['a forbidden label', { addLabelIds: ['SENT'] }],
    ['TRASH with another label', { addLabelIds: ['TRASH', 'STARRED'] }],
    ['an empty label', { addLabelIds: [''] }],
    ['more than 20 labels', { addLabelIds: Array.from({ length: 21 }, (_, i) => `Label_${i}`) }],
    ['a non-JSON body', 'not json'],
  ])('400 VALIDATION_FAILED: %s, with no Gmail call', async (_name, body) => {
    const { h, box, store } = setup();
    await store('m1');
    box.forbidCalls = true;
    const response = await patch(h, 'm1', body);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED', retryable: false });
  });

  it('400 VALIDATION_FAILED when Gmail rejects a label ID', async () => {
    const { h, box, store } = setup();
    await store('m1');
    box.failNext.set('modifyLabels', new ProviderError('invalid_request', 'Invalid label'));
    const response = await patch(h, 'm1', { addLabelIds: ['Label_missing'] });
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED', details: { labelIds: ['Label_missing'] } });
  });

  it('404 MESSAGE_NOT_FOUND for a message not stored for this user, with no Gmail call', async () => {
    const { h, box, store } = setup();
    await store('m1', { userId: OTHER });
    box.forbidCalls = true;
    const response = await patch(h, 'm1', { addLabelIds: ['STARRED'] });
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({ code: 'MESSAGE_NOT_FOUND' });
  });

  it('404 MESSAGE_NOT_FOUND when Gmail no longer has it, deleting the stale row', async () => {
    const { h, box, store, messages } = setup();
    await store('m1');
    box.messages.delete('m1');
    const response = await patch(h, 'm1', { addLabelIds: ['STARRED'] });
    expect(response.status).toBe(404);
    expect(await messages.getMessage(USER, 'm1')).toBeNull();
  });

  it('409 GMAIL_NOT_CONNECTED without a users row', async () => {
    const { h, store } = setup(false);
    await store('m1');
    const response = await patch(h, 'm1', { addLabelIds: ['STARRED'] });
    expect(response.status).toBe(409);
    expect(await errorOf(response)).toMatchObject({ code: 'GMAIL_NOT_CONNECTED' });
  });

  it.each([
    ['revoked', 401, 'GMAIL_TOKEN_REVOKED', false],
    ['rate_limited', 429, 'GMAIL_RATE_LIMITED', true],
    ['upstream', 502, 'GMAIL_UPSTREAM_ERROR', true],
  ] as const)('%s → %i %s', async (kind, status, code, retryable) => {
    const { h, box, store, users } = setup();
    await store('m1');
    box.failNext.set('modifyLabels', new ProviderError(kind, kind, kind === 'rate_limited' ? { retryAfterSeconds: 7 } : {}));
    const response = await patch(h, 'm1', { addLabelIds: ['STARRED'] });
    expect(response.status).toBe(status);
    expect(await errorOf(response)).toMatchObject({ code, retryable });
    if (kind === 'rate_limited') {
      expect(response.headers.get('retry-after')).toBe('7');
    }
    if (kind === 'revoked') {
      expect(users.cleared).toEqual([USER]);
    }
  });

  it('500 INTERNAL on a DB error', async () => {
    const { h, store, messages } = setup();
    await store('m1');
    jest.spyOn(messages, 'getMessage').mockRejectedValue(new Error('db down'));
    const response = await patch(h, 'm1', { addLabelIds: ['STARRED'] });
    expect(response.status).toBe(500);
    expect(await errorOf(response)).toMatchObject({ code: 'INTERNAL' });
  });
});

describe('GET /api/v1/threads/{threadId} (§4.8)', () => {
  const get = (h: Handlers, threadId: string, token?: string) =>
    h.getThread(request('GET', `/api/v1/threads/${threadId}`, undefined, token));

  it('returns stored messages of the thread oldest first, every status, without calling Gmail', async () => {
    const { h, box, store } = setup();
    await store('m2', { threadId: 't1', minute: 2, labels: ['SENT'] });
    await store('m1', { threadId: 't1', minute: 1 });
    await store('m3', { threadId: 't1', minute: 3, labels: ['TRASH'] });
    await store('x1', { threadId: 't2', minute: 4 });
    await store('o1', { threadId: 't1', minute: 5, userId: OTHER });
    box.forbidCalls = true;
    const response = await get(h, 't1');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { threadId: string; truncated: boolean; messages: Array<{ gmailId: string; status: string }> };
    expect(body.threadId).toBe('t1');
    expect(body.truncated).toBe(false);
    expect(body.messages.map((m) => [m.gmailId, m.status])).toEqual([
      ['m1', 'inbox'],
      ['m2', 'sent'],
      ['m3', 'trash'],
    ]);
  });

  it('keeps the 100 newest and flags truncated', async () => {
    const { h, store } = setup();
    for (let i = 0; i < 101; i += 1) {
      await store(`m${String(i).padStart(3, '0')}`, { threadId: 't1', minute: i });
    }
    const body = (await (await get(h, 't1')).json()) as { truncated: boolean; messages: Array<{ gmailId: string }> };
    expect(body.truncated).toBe(true);
    expect(body.messages).toHaveLength(100);
    expect(body.messages[0]?.gmailId).toBe('m001');
    expect(body.messages[99]?.gmailId).toBe('m100');
  });

  it('401 UNAUTHENTICATED without a bearer', async () => {
    const { h } = setup();
    expect((await get(h, 't1', '')).status).toBe(401);
  });

  it('400 VALIDATION_FAILED for a malformed threadId', async () => {
    const { h } = setup();
    const response = await get(h, 't-1');
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it("404 MESSAGE_NOT_FOUND when no stored message has this threadId, including another user's", async () => {
    const { h, store } = setup();
    await store('o1', { threadId: 't9', userId: OTHER });
    const response = await get(h, 't9');
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toMatchObject({ code: 'MESSAGE_NOT_FOUND', details: { threadId: 't9' } });
  });

  it('409 GMAIL_NOT_CONNECTED without a users row', async () => {
    const { h } = setup(false);
    expect((await get(h, 't1')).status).toBe(409);
  });

  it('500 INTERNAL on a DB error', async () => {
    const { h, messages } = setup();
    jest.spyOn(messages, 'listThread').mockRejectedValue(new Error('db down'));
    const response = await get(h, 't1');
    expect(response.status).toBe(500);
    expect(await errorOf(response)).toMatchObject({ code: 'INTERNAL' });
  });
});

describe('GET /api/v1/messages/search (§4.9)', () => {
  const search = (h: Handlers, query: string, token?: string) =>
    h.searchMessages(request('GET', `/api/v1/messages/search?${query}`, undefined, token));

  it('matches every term case-insensitively across statuses, pages, and never calls Gmail', async () => {
    const { h, box, store } = setup();
    await store('m1', { minute: 1, subject: 'Quarterly Report', body: 'numbers' });
    await store('m2', { minute: 2, subject: 'report draft', labels: ['TRASH'] });
    await store('m3', { minute: 3, subject: 'Report', body: 'quarterly figures', labels: ['SENT'] });
    await store('m4', { minute: 4, subject: 'Lunch' });
    await store('o1', { minute: 5, subject: 'quarterly report', userId: OTHER });
    box.forbidCalls = true;

    const first = await search(h, 'q=  REPORT   quarterly &limit=1');
    expect(first.status).toBe(200);
    const page1 = (await first.json()) as { messages: Array<{ gmailId: string; status: string }>; nextCursor: string | null };
    expect(page1.messages.map((m) => [m.gmailId, m.status])).toEqual([['m3', 'sent']]);
    const second = (await (await search(h, `q=report%20quarterly&limit=1&cursor=${page1.nextCursor ?? ''}`)).json()) as {
      messages: Array<{ gmailId: string }>;
      nextCursor: string | null;
    };
    expect(second.messages.map((m) => m.gmailId)).toEqual(['m1']);
    expect(second.nextCursor).toBeNull();
  });

  it('401 UNAUTHENTICATED without a bearer', async () => {
    const { h } = setup();
    expect((await search(h, 'q=hello', '')).status).toBe(401);
  });

  it.each([['missing q', ''], ['one character', 'q=a'], ['201 characters', `q=${'a'.repeat(201)}`], ['bad limit', 'q=ab&limit=0'], ['bad cursor', 'q=ab&cursor=%%%']])(
    '400 VALIDATION_FAILED: %s',
    async (_name, query) => {
      const { h } = setup();
      const response = await search(h, query);
      expect(response.status).toBe(400);
      expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED' });
    },
  );

  it('409 GMAIL_NOT_CONNECTED without a users row', async () => {
    const { h } = setup(false);
    expect((await search(h, 'q=hello')).status).toBe(409);
  });

  it('500 INTERNAL on a DB error', async () => {
    const { h, messages } = setup();
    jest.spyOn(messages, 'searchMessages').mockRejectedValue(new Error('db down'));
    const response = await search(h, 'q=hello');
    expect(response.status).toBe(500);
    expect(await errorOf(response)).toMatchObject({ code: 'INTERNAL' });
  });
});

describe('Drafts (§4.10–§4.12)', () => {
  const create = (body: unknown, token?: string) => request('POST', '/api/v1/drafts', body, token);
  const update = (id: string, body: unknown, token?: string) => request('PATCH', `/api/v1/drafts/${id}`, body, token);
  const remove = (id: string, token?: string) => request('DELETE', `/api/v1/drafts/${id}`, undefined, token);

  it('creates, replaces and deletes a draft; Gmail assigns draftId', async () => {
    const { h, box, store } = setup();
    await store('m1', { threadId: 't1' });
    const created = await h.createDraft(create({ to: 'Ada <ada@example.com>', subject: 'Hi', body: 'x', threadId: 't1' }));
    expect(created.status).toBe(201);
    const { draft } = (await created.json()) as { draft: Record<string, unknown> };
    expect(draft).toMatchObject({
      draftId: 'r-1',
      threadId: 't1',
      to: ['Ada <ada@example.com>'],
      subject: 'Hi',
      body: 'x',
      updatedAt: now.toISOString(),
    });
    expect(box.drafts.get('r-1')?.message).toMatchObject({ from: EMAIL, to: ['Ada <ada@example.com>'], text: 'x' });

    // Full replacement: omitted fields reset to their defaults.
    const replaced = await h.updateDraft(update('r-1', { body: 'second' }));
    expect(replaced.status).toBe(200);
    expect(((await replaced.json()) as { draft: Record<string, unknown> }).draft).toMatchObject({
      draftId: 'r-1',
      to: [],
      subject: '',
      body: 'second',
    });

    const deleted = await h.deleteDraft(remove('r-1'));
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');
    expect(deleted.headers.get('access-control-allow-origin')).toBe(FRONTEND);
    expect(box.drafts.size).toBe(0);
  });

  it('accepts an empty draft', async () => {
    const { h } = setup();
    const response = await h.createDraft(create({}));
    expect(response.status).toBe(201);
    expect(((await response.json()) as { draft: Record<string, unknown> }).draft).toMatchObject({ to: [], subject: '', body: '' });
  });

  it('401 UNAUTHENTICATED without a bearer, on every draft endpoint', async () => {
    const { h, box } = setup();
    box.forbidCalls = true;
    for (const response of [await h.createDraft(create({}, '')), await h.updateDraft(update('r-1', {}, '')), await h.deleteDraft(remove('r-1', ''))]) {
      expect(response.status).toBe(401);
    }
  });

  it.each([
    ['draftId in the body (server-managed)', { draftId: 'r-9' }],
    ['status in the body', { status: 'inbox' }],
    ['a bad address', { to: ['not-an-address'] }],
    ['101 recipients', { to: Array.from({ length: 101 }, (_, i) => `a${i}@example.com`) }],
    ['a subject with a line break', { subject: 'a\nb' }],
    ['a non-string body', { body: 3 }],
    ['a malformed threadId', { threadId: 't-1' }],
    ['a non-JSON body', 'nope'],
  ])('400 VALIDATION_FAILED: %s, with no Gmail call', async (_name, body) => {
    const { h, box } = setup();
    box.forbidCalls = true;
    const response = await h.createDraft(create(body));
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('400 VALIDATION_FAILED for a malformed draftId in the path', async () => {
    const { h, box } = setup();
    box.forbidCalls = true;
    expect((await h.updateDraft(update('r%201', {}))).status).toBe(400);
    expect((await h.deleteDraft(remove('r%201'))).status).toBe(400);
  });

  it('404 MESSAGE_NOT_FOUND for an unknown threadId on create, and an unknown draftId on update and delete', async () => {
    const { h } = setup();
    const created = await h.createDraft(create({ threadId: 'nope' }));
    expect(created.status).toBe(404);
    expect(await errorOf(created)).toMatchObject({ code: 'MESSAGE_NOT_FOUND', details: { threadId: 'nope' } });
    const updated = await h.updateDraft(update('r-404', {}));
    expect(await errorOf(updated)).toMatchObject({ code: 'MESSAGE_NOT_FOUND', details: { draftId: 'r-404' } });
    const deleted = await h.deleteDraft(remove('r-404'));
    expect(deleted.status).toBe(404);
    expect(await errorOf(deleted)).toMatchObject({ code: 'MESSAGE_NOT_FOUND', details: { draftId: 'r-404' } });
  });

  it('409 GMAIL_NOT_CONNECTED without a users row', async () => {
    const { h } = setup(false);
    expect((await h.createDraft(create({}))).status).toBe(409);
    expect((await h.updateDraft(update('r-1', {}))).status).toBe(409);
    expect((await h.deleteDraft(remove('r-1'))).status).toBe(409);
  });

  it.each([
    ['revoked', 401, 'GMAIL_TOKEN_REVOKED'],
    ['rate_limited', 429, 'GMAIL_RATE_LIMITED'],
    ['upstream', 502, 'GMAIL_UPSTREAM_ERROR'],
  ] as const)('%s → %i %s on create, update and delete', async (kind, status, code) => {
    const { h, box, users } = setup();
    box.drafts.set('r-1', { message: { from: EMAIL, to: [], subject: '', text: '' }, messageId: 'd1', threadId: 'd1' });
    box.failNext.set('createDraft', new ProviderError(kind, kind));
    box.failNext.set('updateDraft', new ProviderError(kind, kind));
    box.failNext.set('deleteDraft', new ProviderError(kind, kind));
    for (const response of [await h.createDraft(create({})), await h.updateDraft(update('r-1', {})), await h.deleteDraft(remove('r-1'))]) {
      expect(response.status).toBe(status);
      expect(await errorOf(response)).toMatchObject({ code });
    }
    if (kind === 'revoked') {
      expect(users.cleared).toEqual([USER, USER, USER]);
    }
  });

  it('500 INTERNAL on an unexpected failure', async () => {
    const { h, users } = setup();
    jest.spyOn(users, 'getUserEmail').mockRejectedValue(new Error('db down'));
    const response = await h.createDraft(create({}));
    expect(response.status).toBe(500);
    expect(await errorOf(response)).toMatchObject({ code: 'INTERNAL' });
  });
});
