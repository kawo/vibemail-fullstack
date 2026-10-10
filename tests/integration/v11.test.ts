/**
 * CONTRACT.md v1.1 against the LIVE dev/test database: the `status` trigger (§3.4, §5.1), the
 * all-messages list (§4.2), label updates (§4.7), the thread view (§4.8) and the
 * `search_messages` function (§4.9), including tenant isolation (§5.3). Gmail is faked.
 */
import { toMessageRow } from '../../src/db/messages';
import { fakeMessage } from '../fakes/fakeProvider';
import {
  admin,
  bearerFor,
  buildApp,
  buildBrokenDbApp,
  createTestUser,
  deleteTestUsers,
  envelope,
  rawMessageRows,
  seedConnectedUser,
  seedMessages,
} from './support';

jest.setTimeout(60_000);

afterAll(deleteTestUsers);

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));
const request = (method: string, path: string, token: string, body?: unknown) =>
  new Request(`https://api.vibemail.test${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('messages.status trigger (§3.4, §5.1)', () => {
  it('derives status on insert and update, overriding any written value', async () => {
    const user = await createTestUser();
    const row = {
      ...toMessageRow(user.userId, fakeMessage({ id: 'st1', labels: ['INBOX', 'TRASH'] }), new Date()),
      status: 'inbox' as const,
    };
    const inserted = await admin().from('messages').insert(row).select('status').single();
    expect(inserted.error).toBeNull();
    expect(inserted.data?.status).toBe('trash');

    const updated = await admin()
      .from('messages')
      .update({ label_ids: ['SENT'], status: 'spam' })
      .eq('user_id', user.userId)
      .eq('gmail_id', 'st1')
      .select('status')
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data?.status).toBe('sent');
  });
});

describe('§4.2, §4.7, §4.8, §4.9 through the live database', () => {
  it('lists every status, archives through PATCH, and shows the thread oldest first', async () => {
    const user = await createTestUser();
    const app = buildApp();
    await seedConnectedUser(app, user, { historyId: '10' });
    const seeded = [
      fakeMessage({ id: 'th1', threadId: 'T1', labels: ['INBOX'], receivedAt: at(1) }),
      fakeMessage({ id: 'th2', threadId: 'T1', labels: ['SENT'], receivedAt: at(2) }),
      fakeMessage({ id: 'ar1', threadId: 'T2', labels: ['Label_1'], receivedAt: at(3) }),
    ];
    await seedMessages(app, user, seeded);
    for (const message of seeded) {
      app.box.messages.set(message.id, message);
    }
    const token = bearerFor(user);

    const listed = await app.handlers.listMessages(request('GET', '/api/v1/messages', token));
    const list = (await listed.json()) as { messages: Array<{ gmailId: string; status: string }> };
    expect(list.messages.map((m) => [m.gmailId, m.status])).toEqual([
      ['ar1', 'archived'],
      ['th2', 'sent'],
      ['th1', 'inbox'],
    ]);

    const patched = await app.handlers.updateLabels(
      request('PATCH', '/api/v1/messages/th1', token, { removeLabelIds: ['INBOX'] }),
    );
    expect(patched.status).toBe(200);
    const rows = await rawMessageRows(user.userId);
    expect(rows.find((r) => r.gmail_id === 'th1')).toMatchObject({ status: 'archived', label_ids: [] });

    app.box.forbidCalls = true;
    const thread = await app.handlers.getThread(request('GET', '/api/v1/threads/T1', token));
    expect(thread.status).toBe(200);
    const body = (await thread.json()) as { messages: Array<{ gmailId: string; status: string }>; truncated: boolean };
    expect(body.messages.map((m) => [m.gmailId, m.status])).toEqual([
      ['th1', 'archived'],
      ['th2', 'sent'],
    ]);
    expect(body.truncated).toBe(false);
  });

  it('searches with every term, literal % and _, pagination and tenant isolation', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const app = buildApp();
    await seedConnectedUser(app, a);
    await seedConnectedUser(app, b);
    await seedMessages(app, a, [
      fakeMessage({ id: 'sa1', subject: 'Quarterly report', bodyText: 'see 100% numbers', receivedAt: at(1) }),
      fakeMessage({
        id: 'sa2',
        subject: 'REPORT draft',
        to: ['quarterly_team@vibemail.test'],
        labels: ['TRASH'],
        receivedAt: at(2),
      }),
      fakeMessage({ id: 'sa3', subject: 'Lunch', bodyText: '100x faster', receivedAt: at(3) }),
    ]);
    await seedMessages(app, b, [fakeMessage({ id: 'sb1', subject: 'quarterly report', receivedAt: at(4) })]);
    app.box.forbidCalls = true;
    const token = bearerFor(a);
    const search = async (query: string) => {
      const response = await app.handlers.searchMessages(request('GET', `/api/v1/messages/search?${query}`, token));
      expect(response.status).toBe(200);
      return (await response.json()) as { messages: Array<{ gmailId: string }>; nextCursor: string | null };
    };

    const first = await search('q=report%20QUARTERLY&limit=1');
    expect(first.messages.map((m) => m.gmailId)).toEqual(['sa2']);
    const second = await search(`q=report%20QUARTERLY&limit=1&cursor=${first.nextCursor ?? ''}`);
    expect(second.messages.map((m) => m.gmailId)).toEqual(['sa1']);
    expect(second.nextCursor).toBeNull();

    // `%` and `_` match literally: as wildcards, `100%` would also match "100x faster", and
    // `report_draft` would match "REPORT draft".
    expect((await search('q=100%25')).messages.map((m) => m.gmailId)).toEqual(['sa1']);
    expect((await search('q=report_draft')).messages).toEqual([]);
    // A to_address element matches too.
    expect((await search('q=quarterly_team')).messages.map((m) => m.gmailId)).toEqual(['sa2']);
  });

  it("does not show another user's thread", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const app = buildApp();
    await seedConnectedUser(app, a);
    await seedConnectedUser(app, b);
    await seedMessages(app, b, [fakeMessage({ id: 'ob1', threadId: 'TB' })]);
    const response = await app.handlers.getThread(request('GET', '/api/v1/threads/TB', bearerFor(a)));
    expect(response.status).toBe(404);
    await expect(envelope(response)).resolves.toMatchObject({ error: { code: 'MESSAGE_NOT_FOUND' } });
  });

  it('500 INTERNAL when the database fails, on the thread view, search and label updates', async () => {
    const user = await createTestUser();
    const app = buildBrokenDbApp();
    const token = bearerFor(user);
    for (const response of [
      await app.handlers.getThread(request('GET', '/api/v1/threads/T1', token)),
      await app.handlers.searchMessages(request('GET', '/api/v1/messages/search?q=hello', token)),
      await app.handlers.updateLabels(request('PATCH', '/api/v1/messages/m1', token, { addLabelIds: ['STARRED'] })),
    ]) {
      expect(response.status).toBe(500);
      await expect(envelope(response)).resolves.toMatchObject({ error: { code: 'INTERNAL' } });
    }
  });
});
