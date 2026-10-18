/**
 * CONTRACT.md §4.13 `GET /api/v1/drafts` through the real handler, with in-memory repositories
 * and the fake provider. Every `error.code` in its error table that the handler decides has a test.
 */
import jwt from 'jsonwebtoken';
import type { AppDeps } from '../../src/http/deps';
import { createHandlers } from '../../src/http/handlers';
import { ProviderError } from '../../src/providers/provider';
import { createFakeProviderFactory } from '../fakes/fakeProvider';
import { FakeSessions } from '../fakes/fakeSessions';
import { MemoryMessages, MemoryUsers } from '../fakes/memoryRepos';
import { MemoryAttachmentStore, MemoryAttachments } from '../fakes/memoryAttachments';

const SECRET = 'test-jwt-secret-at-least-32-characters!!';
const SUPABASE = 'https://proj.supabase.co';
const USER = 'user-1';
const EMAIL = 'me@example.com';
const now = new Date('2026-10-10T10:00:00.000Z');

const bearer = () =>
  jwt.sign({ sub: USER, email: EMAIL }, SECRET, {
    algorithm: 'HS256',
    audience: 'authenticated',
    issuer: `${SUPABASE}/auth/v1`,
    expiresIn: '1h',
  });

function setup(connected = true) {
  const { factory, box } = createFakeProviderFactory();
  const users = new MemoryUsers();
  if (connected) {
    users.rows.set(USER, {
      googleId: `google-${USER}`,
      userId: USER,
      email: EMAIL,
      scopes: [],
      credentials: { refreshToken: 'r', accessToken: null, accessTokenExpiresAt: null },
      historyId: '1',
      lastSyncedAt: now,
    });
  }
  const deps: AppDeps = {
    factory,
    users,
    messages: new MemoryMessages(),
    sessions: new FakeSessions({ userId: USER, email: EMAIL }),
    attachments: new MemoryAttachments(),
    attachmentStore: new MemoryAttachmentStore(),
    jwtSecret: SECRET,
    supabaseUrl: SUPABASE,
    frontendUrl: 'https://app.vibemail.test',
    pubsubVerificationToken: 't'.repeat(32),
    cronSecret: 'c'.repeat(32),
    waitUntil: () => undefined,
    now: () => now,
    log: jest.fn(),
  };
  // Three drafts, saved in this order: Gmail lists the newest first.
  for (const [n, subject] of [[1, 'First'], [2, 'Second'], [3, 'Third']] as const) {
    box.drafts.set(`r-${n}`, {
      message: { from: EMAIL, to: n === 1 ? [] : ['Ada <ada@x.io>'], subject, text: `body ${n}` },
      messageId: `dm${n}`,
      threadId: `T${n}`,
      updatedAt: new Date(Date.UTC(2026, 9, 1, 0, n)),
    });
  }
  return { h: createHandlers(() => deps), box, users };
}

const get = (h: ReturnType<typeof setup>['h'], query = '') =>
  h.listDrafts(new Request(`https://api.vibemail.test/api/v1/drafts${query}`, { headers: { Authorization: `Bearer ${bearer()}` } }));

type Page = { drafts: Array<Record<string, unknown>>; nextCursor: string | null };
type Envelope = { error: { code: string; details?: Record<string, unknown> } };

describe('GET /api/v1/drafts (CONTRACT.md §4.13)', () => {
  it('200: the newest drafts as DraftDTOs, read from Gmail', async () => {
    const { h, box } = setup();
    const response = await get(h);
    expect(response.status).toBe(200);
    const page = (await response.json()) as Page;
    expect(page.drafts.map((d) => d.draftId)).toEqual(['r-3', 'r-2', 'r-1']);
    expect(page.drafts[0]).toEqual({
      draftId: 'r-3',
      gmailId: 'dm3',
      threadId: 'T3',
      to: ['Ada <ada@x.io>'],
      subject: 'Third',
      body: 'body 3',
      updatedAt: '2026-10-01T00:03:00.000Z',
    });
    expect(page.nextCursor).toBeNull();
    expect(box.calls.map((c) => c.method)).toEqual(['listDrafts']);
  });

  it('pages with limit and an opaque cursor that wraps the page token', async () => {
    const { h } = setup();
    const first = (await (await get(h, '?limit=2')).json()) as Page;
    expect(first.drafts.map((d) => d.draftId)).toEqual(['r-3', 'r-2']);
    expect(first.nextCursor).not.toBeNull();
    const second = (await (await get(h, `?limit=2&cursor=${first.nextCursor}`)).json()) as Page;
    expect(second.drafts.map((d) => d.draftId)).toEqual(['r-1']);
    expect(second.nextCursor).toBeNull();
  });

  it.each(['?limit=0', '?limit=51', '?limit=abc', '?cursor=%25%25%25', '?cursor=bm90LWpzb24'])('400 VALIDATION_FAILED for %s', async (query) => {
    const { h, box } = setup();
    const response = await get(h, query);
    expect(response.status).toBe(400);
    expect(((await response.json()) as Envelope).error.code).toBe('VALIDATION_FAILED');
    expect(box.calls).toEqual([]);
  });

  it('400 VALIDATION_FAILED with details.cursor when Gmail rejects the page token', async () => {
    const { h, box } = setup();
    box.failNext.set('listDrafts', new ProviderError('invalid_request', 'Invalid pageToken'));
    const cursor = Buffer.from(JSON.stringify({ p: 'stale' }), 'utf8').toString('base64url');
    const response = await get(h, `?cursor=${cursor}`);
    expect(response.status).toBe(400);
    expect(((await response.json()) as Envelope).error).toMatchObject({ code: 'VALIDATION_FAILED', details: { cursor } });
  });

  it('409 GMAIL_NOT_CONNECTED without a connected account', async () => {
    const { h } = setup(false);
    const response = await get(h);
    expect(response.status).toBe(409);
    expect(((await response.json()) as Envelope).error.code).toBe('GMAIL_NOT_CONNECTED');
  });

  it('401 GMAIL_TOKEN_REVOKED clears the stored tokens; 429 carries Retry-After', async () => {
    const revoked = setup();
    revoked.box.failNext.set('listDrafts', new ProviderError('revoked', 'invalid_grant'));
    const response = await get(revoked.h);
    expect(response.status).toBe(401);
    expect(((await response.json()) as Envelope).error.code).toBe('GMAIL_TOKEN_REVOKED');
    expect(revoked.users.cleared).toEqual([USER]);

    const limited = setup();
    limited.box.failNext.set('listDrafts', new ProviderError('rate_limited', 'slow down', { retryAfterSeconds: 7 }));
    const busy = await get(limited.h);
    expect(busy.status).toBe(429);
    expect(busy.headers.get('Retry-After')).toBe('7');
  });
});
