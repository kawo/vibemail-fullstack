import { ProviderError } from '../../src/providers/provider';
import { isValidAddress, sendForUser, validateSendInput } from '../../src/send';
import { createFakeProviderFactory } from '../fakes/fakeProvider';
import { MemoryAttachmentStore, MemoryAttachments } from '../fakes/memoryAttachments';
import { MemoryMessages, MemoryUsers } from '../fakes/memoryRepos';

const USER = 'user-1';
const at = new Date('2026-10-06T10:00:00.000Z');

function setup(connected = true) {
  const { factory, box } = createFakeProviderFactory();
  const users = new MemoryUsers();
  if (connected) {
    users.rows.set(USER, {
      googleId: 'g',
      userId: USER,
      email: 'me@example.com',
      scopes: [],
      credentials: { refreshToken: 'r', accessToken: null, accessTokenExpiresAt: null },
      historyId: '1',
      lastSyncedAt: null,
    });
  }
  const messages = new MemoryMessages();
  const log = jest.fn();
  const attachments = new MemoryAttachments();
  const attachmentStore = new MemoryAttachmentStore();
  return {
    deps: { factory, users, messages, attachments, attachmentStore, now: () => at, log },
    box,
    users,
    messages,
    log,
    attachments,
    attachmentStore,
  };
}

describe('sendForUser (CONTRACT.md §4.3)', () => {
  it('sends from the account email, then stores the fetched sent message', async () => {
    const { deps, box, messages } = setup();
    const row = await sendForUser(deps, USER, { to: 'you@example.com', subject: 'Hi', body: 'Hello' });

    expect(box.sent).toEqual([{ from: 'me@example.com', to: ['you@example.com'], subject: 'Hi', text: 'Hello' }]);
    expect(box.calls.map((c) => c.method)).toEqual(['sendMessage', 'getMessage']);
    expect(row).toMatchObject({
      user_id: USER,
      gmail_id: 'sent-1',
      label_ids: ['SENT'],
      from_address: 'me@example.com',
      to_address: ['you@example.com'],
      subject: 'Hi',
      body_plain: 'Hello',
    });
    // The stored row is the written one plus the columns the database generates.
    expect(messages.forUser(USER)).toEqual([{ ...row, id: expect.any(String), created_at: expect.any(String), updated_at: expect.any(String) }]);
  });

  it('passes threadId through unchanged, with no derived reply headers', async () => {
    const { deps, box } = setup();
    const row = await sendForUser(deps, USER, { to: ['a@x.io', 'B <b@x.io>'], subject: 'Topic', body: 'x', threadId: 'T123' });
    expect(box.sent[0]).toEqual({ from: 'me@example.com', to: ['a@x.io', 'B <b@x.io>'], subject: 'Topic', text: 'x', threadId: 'T123' });
    expect(row.thread_id).toBe('T123');
  });

  it('maps a Gmail 404 on threadId to MESSAGE_NOT_FOUND', async () => {
    const { deps, box } = setup();
    box.failNext.set('sendMessage', new ProviderError('not_found', 'thread'));
    await expect(sendForUser(deps, USER, { to: 'a@x.io', subject: 's', body: 'b', threadId: 'Tx' })).rejects.toMatchObject({
      code: 'MESSAGE_NOT_FOUND',
      details: { threadId: 'Tx' },
    });
  });

  it('reports sentGmailId when fetching the sent message fails', async () => {
    const { deps, box, log } = setup();
    box.failNext.set('getMessage', new ProviderError('upstream', 'boom'));
    await expect(sendForUser(deps, USER, { to: 'a@x.io', subject: 's', body: 'b' })).rejects.toMatchObject({
      code: 'GMAIL_UPSTREAM_ERROR',
      details: { sentGmailId: 'sent-1' },
    });
    expect(log).toHaveBeenCalled();
  });

  it('reports sentGmailId as INTERNAL when storing fails', async () => {
    const { deps, messages } = setup();
    jest.spyOn(messages, 'upsertMessages').mockRejectedValue(new Error('db down'));
    await expect(sendForUser(deps, USER, { to: 'a@x.io', subject: 's', body: 'b' })).rejects.toMatchObject({
      code: 'INTERNAL',
      details: { sentGmailId: 'sent-1' },
    });
  });

  it('clears tokens and reports GMAIL_TOKEN_REVOKED on invalid_grant', async () => {
    const { deps, box, users } = setup();
    box.failNext.set('sendMessage', new ProviderError('revoked', 'invalid_grant'));
    await expect(sendForUser(deps, USER, { to: 'a@x.io', subject: 's', body: 'b' })).rejects.toMatchObject({
      code: 'GMAIL_TOKEN_REVOKED',
    });
    expect(users.cleared).toEqual([USER]);
  });

  it('rejects an unconnected user and invalid input without any provider call', async () => {
    const unconnected = setup(false);
    await expect(sendForUser(unconnected.deps, USER, { to: 'a@x.io', subject: 's', body: 'b' })).rejects.toMatchObject({
      code: 'GMAIL_NOT_CONNECTED',
    });
    const invalid = setup();
    await expect(sendForUser(invalid.deps, USER, { to: [], subject: 's', body: 'b' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect([...unconnected.box.calls, ...invalid.box.calls]).toEqual([]);
  });
});

describe('validateSendInput', () => {
  it('collects every issue', () => {
    expect(() =>
      validateSendInput({ to: ['nope', 'ok@x.io'], subject: 'a\r\nBcc: evil@x.io', body: 3, threadId: '../x' }),
    ).toThrow(
      expect.objectContaining({
        code: 'VALIDATION_FAILED',
        details: {
          issues: [
            { field: 'to[0]', message: 'not a valid email address' },
            { field: 'subject', message: 'must not contain line breaks' },
            { field: 'body', message: 'must be a string' },
            { field: 'threadId', message: 'must be a Gmail thread ID' },
          ],
        },
      }),
    );
  });

  it('accepts a single address string, an empty body and an empty subject', () => {
    expect(validateSendInput({ to: ' a@x.io ', subject: '', body: '' })).toEqual({ to: ['a@x.io'], subject: '', body: '', attachmentIds: [] });
  });

  it('caps recipients at 100 and subjects at 998 characters', () => {
    const many = Array.from({ length: 101 }, (_, i) => `u${i}@x.io`);
    expect(() => validateSendInput({ to: many, subject: 's', body: 'b' })).toThrow(/invalid send request/);
    expect(() => validateSendInput({ to: 'a@x.io', subject: 's'.repeat(999), body: 'b' })).toThrow(/invalid send request/);
  });

  it.each([
    ['a@x.io', true],
    ['"Doe, Jane" <jane@x.io>', true],
    ['Bob <b@x.io>', true],
    ['no-at-sign', false],
    ['a@x.io\r\nBcc: e@x.io', false],
    ['Bob <not an address>', false],
  ])('isValidAddress(%j) is %s', (address, valid) => {
    expect(isValidAddress(address)).toBe(valid);
  });
});

describe('sendForUser with attachments (CONTRACT.md §4.3, v1.3)', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const C = '33333333-3333-4333-8333-333333333333';
  const request = { to: 'you@example.com', subject: 'Files', body: 'Attached' };

  /** Reserves a row and, unless `uploaded` is false, stores its object. */
  async function attach(
    t: ReturnType<typeof setup>,
    id: string,
    options: { owner?: string; filename?: string; bytes?: number; contentType?: string; uploaded?: boolean } = {},
  ) {
    const owner = options.owner ?? USER;
    const storagePath = `${owner}/${id}`;
    await t.attachments.create(owner, { id, filename: options.filename ?? `${id}.bin`, mimeType: 'application/x-declared', size: 1, storagePath });
    if (options.uploaded !== false) {
      t.attachmentStore.objects.set(storagePath, {
        content: Buffer.alloc(options.bytes ?? 3, 7),
        contentType: options.contentType ?? 'application/pdf',
      });
    }
  }

  it('sends the stored files, in order, with their stored content type', async () => {
    const t = setup();
    await attach(t, A, { filename: 'b.pdf', bytes: 5 });
    await attach(t, B, { filename: 'a.txt', contentType: '' });
    await sendForUser(t.deps, USER, { ...request, attachmentIds: [A, B] });
    expect(t.box.sent[0]?.attachments).toEqual([
      { filename: 'b.pdf', mimeType: 'application/pdf', content: Buffer.alloc(5, 7) },
      { filename: 'a.txt', mimeType: 'application/octet-stream', content: Buffer.alloc(3, 7) },
    ]);
  });

  it.each([
    ['not an array', 'abc', 'attachmentIds'],
    ['more than 20', Array.from({ length: 21 }, (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`), 'attachmentIds'],
    ['a duplicate', [A, A], 'attachmentIds[1]'],
    ['not a UUID', ['nope'], 'attachmentIds[0]'],
  ])('rejects attachmentIds that are %s', async (_name, attachmentIds, field) => {
    const t = setup();
    await expect(sendForUser(t.deps, USER, { ...request, attachmentIds })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { issues: expect.arrayContaining([expect.objectContaining({ field })]) },
    });
    expect(t.box.calls).toEqual([]);
  });

  it("treats another user's attachment as unknown, before calling Gmail", async () => {
    const t = setup();
    await attach(t, A, { owner: 'someone-else' });
    await expect(sendForUser(t.deps, USER, { ...request, attachmentIds: [A] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { issues: [{ field: 'attachmentIds[0]', message: 'unknown attachment' }] },
    });
    expect(t.box.calls).toEqual([]);
  });

  it('reports an attachment that was reserved but not uploaded yet', async () => {
    const t = setup();
    await attach(t, A);
    await attach(t, B, { uploaded: false });
    await expect(sendForUser(t.deps, USER, { ...request, attachmentIds: [A, B] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { issues: [{ field: 'attachmentIds[1]', message: 'not uploaded yet' }] },
    });
    expect(t.box.calls).toEqual([]);
  });

  it('answers FILE_TOO_LARGE when the stored files are over 25 MB together, ignoring declared sizes', async () => {
    const t = setup();
    await attach(t, A, { bytes: 13_107_200 });
    await attach(t, B, { bytes: 13_107_200 });
    await attach(t, C, { bytes: 1 });
    await expect(sendForUser(t.deps, USER, { ...request, attachmentIds: [A, B, C] })).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
      details: { maxBytes: 26214400, totalBytes: 26214401 },
    });
    expect(t.box.calls).toEqual([]);
  });

  it('sends exactly 25 MB in total', async () => {
    const t = setup();
    await attach(t, A, { bytes: 26_214_400 });
    await sendForUser(t.deps, USER, { ...request, attachmentIds: [A] });
    expect(t.box.sent).toHaveLength(1);
  });

  it('sends without attachments when the list is empty', async () => {
    const t = setup();
    await sendForUser(t.deps, USER, { ...request, attachmentIds: [] });
    expect(t.box.sent[0]).not.toHaveProperty('attachments');
  });
});
