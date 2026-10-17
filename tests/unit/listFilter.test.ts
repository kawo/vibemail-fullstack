/**
 * CONTRACT.md §4.2 (v1.2) `label` filter: parsing, and every filter through the real handler with
 * in-memory repositories.
 */
import jwt from 'jsonwebtoken';
import type { AppDeps } from '../../src/http/deps';
import { createHandlers } from '../../src/http/handlers';
import { toMessageRow } from '../../src/db/messages';
import { parseListQuery } from '../../src/messages/list';
import { createFakeProviderFactory, fakeMessage } from '../fakes/fakeProvider';
import { FakeSessions } from '../fakes/fakeSessions';
import { MemoryMessages, MemoryUsers } from '../fakes/memoryRepos';

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

describe('parseListQuery label (CONTRACT.md §4.2)', () => {
  it('defaults to all', () => {
    expect(parseListQuery(new URL('http://x/api/v1/messages')).filter).toEqual({ kind: 'all' });
  });

  it.each(['all', 'starred', 'archive', 'trash'])('accepts %s', (label) => {
    expect(parseListQuery(new URL(`http://x/?label=${label}`)).filter).toEqual({ kind: label });
  });

  it('accepts a custom label ID', () => {
    expect(parseListQuery(new URL('http://x/?label=Label_12')).filter).toEqual({ kind: 'label', labelId: 'Label_12' });
  });

  it.each(['INBOX', 'label_1', '', 'Label_', 'Label_1;drop'])('rejects %j', (label) => {
    expect(() => parseListQuery(new URL(`http://x/?label=${encodeURIComponent(label)}`))).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: { issues: [expect.objectContaining({ field: 'label' })] },
      }),
    );
  });
});

describe('GET /api/v1/messages?label= (CONTRACT.md §4.2)', () => {
  async function setup() {
    const { factory } = createFakeProviderFactory();
    const users = new MemoryUsers();
    users.rows.set(USER, {
      googleId: `google-${USER}`,
      userId: USER,
      email: EMAIL,
      scopes: [],
      credentials: { refreshToken: 'r', accessToken: null, accessTokenExpiresAt: null },
      historyId: '1',
      lastSyncedAt: now,
    });
    const messages = new MemoryMessages();
    const deps: AppDeps = {
      factory,
      users,
      messages,
      sessions: new FakeSessions({ userId: USER, email: EMAIL }),
      jwtSecret: SECRET,
      supabaseUrl: SUPABASE,
      frontendUrl: 'https://app.vibemail.test',
      pubsubVerificationToken: 't'.repeat(32),
      cronSecret: 'c'.repeat(32),
      waitUntil: () => undefined,
      now: () => now,
      log: jest.fn(),
    };
    // One stored message per case, newest first by minute.
    const rows: [string, string[]][] = [
      ['inbox', ['INBOX']],
      ['starred', ['INBOX', 'STARRED']],
      ['starredtrash', ['TRASH', 'STARRED']],
      ['archived', ['Label_3']],
      ['trashed', ['TRASH']],
      ['spam', ['SPAM']],
      ['labelled', ['INBOX', 'Label_7']],
    ];
    for (const [index, [id, labels]] of rows.entries()) {
      const message = fakeMessage({ id, labels, receivedAt: new Date(Date.UTC(2026, 9, 1, 0, 59 - index)) });
      await messages.upsertMessages(USER, [toMessageRow(USER, message, now)]);
    }
    return createHandlers(() => deps);
  }

  const list = async (query: string) => {
    const h = await setup();
    const response = await h.listMessages(
      new Request(`https://api.vibemail.test/api/v1/messages${query}`, { headers: { Authorization: `Bearer ${bearer()}` } }),
    );
    return { response, body: (await response.json()) as { messages: { gmailId: string }[]; nextCursor: string | null } };
  };
  const ids = async (query: string) => (await list(query)).body.messages.map((m) => m.gmailId);

  it('all (and no label) excludes trash and spam', async () => {
    const expected = ['inbox', 'starred', 'archived', 'labelled'];
    expect(await ids('')).toEqual(expected);
    expect(await ids('?label=all')).toEqual(expected);
  });
  it('starred excludes a starred message in the trash', async () => expect(await ids('?label=starred')).toEqual(['starred']));
  it('archive is status archived', async () => expect(await ids('?label=archive')).toEqual(['archived']));
  it('trash is status trash', async () => expect(await ids('?label=trash')).toEqual(['starredtrash', 'trashed']));
  it('a custom label matches labelIds outside trash and spam', async () =>
    expect(await ids('?label=Label_7')).toEqual(['labelled']));

  it('pages a filtered list with its own cursor', async () => {
    const h = await setup();
    const get = (query: string) =>
      h.listMessages(new Request(`https://api.vibemail.test/api/v1/messages${query}`, { headers: { Authorization: `Bearer ${bearer()}` } }));
    const first = (await (await get('?label=trash&limit=1')).json()) as { messages: { gmailId: string }[]; nextCursor: string };
    expect(first.messages.map((m) => m.gmailId)).toEqual(['starredtrash']);
    const second = (await (await get(`?label=trash&limit=1&cursor=${first.nextCursor}`)).json()) as {
      messages: { gmailId: string }[];
      nextCursor: string | null;
    };
    expect(second.messages.map((m) => m.gmailId)).toEqual(['trashed']);
    expect(second.nextCursor).toBeNull();
  });

  it('answers VALIDATION_FAILED for an invalid label', async () => {
    const { response, body } = await list('?label=INBOX');
    expect(response.status).toBe(400);
    expect((body as unknown as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });
});
