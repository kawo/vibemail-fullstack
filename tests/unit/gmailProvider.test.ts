import type { GmailAuthConfig } from '../../src/providers/gmail/auth';
import { GmailMailProvider } from '../../src/providers/gmail/provider';
import { cursor } from '../fakes/fakeProvider';

const config: GmailAuthConfig = {
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'http://localhost:3000/cb',
  pubsubTopic: 'projects/p/topics/t',
};
const creds = { refreshToken: 'r', accessToken: 'a', accessTokenExpiresAt: new Date(Date.now() + 3600_000) };

interface RequestOptions {
  url: string;
  params?: Record<string, unknown>;
}

function providerWith(respond: (options: RequestOptions) => unknown) {
  const provider = new GmailMailProvider(config, creds, jest.fn());
  const client = (provider as unknown as { bound: { client: { request: (o: RequestOptions) => Promise<unknown> } } })
    .bound.client;
  const calls: RequestOptions[] = [];
  jest.spyOn(client, 'request').mockImplementation(async (options: RequestOptions) => {
    calls.push(options);
    return respond(options);
  });
  return { provider, calls };
}

const ids = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `m${from + i}`, threadId: `t${from + i}` }));

afterEach(() => jest.restoreAllMocks());

describe('GmailMailProvider.listInboxMessageIds', () => {
  it('pages with pageToken and stops at max', async () => {
    const { provider, calls } = providerWith((o) => ({
      data: o.params?.pageToken
        ? { messages: ids(30, 30), nextPageToken: 'p3' }
        : { messages: ids(0, 30), nextPageToken: 'p2' },
    }));
    const result = await provider.listInboxMessageIds(50);
    expect(result).toHaveLength(50);
    expect(result[0]).toBe('m0');
    expect(result[49]).toBe('m49');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.params).toMatchObject({ labelIds: ['INBOX'], maxResults: 50 });
    expect(calls[1]?.params).toMatchObject({ labelIds: ['INBOX'], maxResults: 20, pageToken: 'p2' });
  });

  it('stops when the inbox is exhausted', async () => {
    const { provider, calls } = providerWith(() => ({ data: { messages: ids(0, 3) } }));
    await expect(provider.listInboxMessageIds(50)).resolves.toEqual(['m0', 'm1', 'm2']);
    expect(calls).toHaveLength(1);
  });

  it('handles an empty inbox', async () => {
    const { provider } = providerWith(() => ({ data: { resultSizeEstimate: 0 } }));
    await expect(provider.listInboxMessageIds(50)).resolves.toEqual([]);
  });
});

describe('GmailMailProvider.getMessage', () => {
  it('requests format=full and parses the result', async () => {
    const { provider, calls } = providerWith(() => ({
      data: { id: 'm1', threadId: 't1', historyId: '9', internalDate: '0', labelIds: ['INBOX'] },
    }));
    await expect(provider.getMessage('m1')).resolves.toMatchObject({ id: 'm1', syncCursor: '9', inInbox: true });
    expect(calls[0]?.url).toContain('/gmail/v1/users/me/messages/m1');
    expect(calls[0]?.params).toMatchObject({ format: 'full' });
  });

  it('maps a 404 to not_found', async () => {
    const { provider } = providerWith(() => {
      throw { response: { status: 404 } };
    });
    await expect(provider.getMessage('gone')).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('GmailMailProvider.listChanges', () => {
  it('requests history from the given cursor and maps records to ordered changes', async () => {
    const { provider, calls } = providerWith(() => ({
      data: {
        historyId: '250',
        nextPageToken: 'n2',
        history: [
          { id: '201', messagesAdded: [{ message: { id: 'a', threadId: 't' } }] },
          { id: '202', messagesDeleted: [{ message: { id: 'b' } }] },
          { id: '203', labelsAdded: [{ message: { id: 'c' }, labelIds: ['STARRED'] }] },
          { id: '204', labelsRemoved: [{ message: { id: 'c' }, labelIds: ['UNREAD'] }] },
        ],
      },
    }));
    const page = await provider.listChanges(cursor('200'), 'p1');
    expect(page).toEqual({
      changes: [
        { type: 'messageAdded', messageId: 'a' },
        { type: 'messageDeleted', messageId: 'b' },
        { type: 'labelsAdded', messageId: 'c', labels: ['STARRED'] },
        { type: 'labelsRemoved', messageId: 'c', labels: ['UNREAD'] },
      ],
      nextPageToken: 'n2',
      cursor: '250',
    });
    expect(calls[0]?.url).toContain('/gmail/v1/users/me/history');
    expect(calls[0]?.params).toMatchObject({
      startHistoryId: '200',
      pageToken: 'p1',
      historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
    });
  });

  it('maps a 404 to cursor_expired', async () => {
    const { provider } = providerWith(() => {
      throw { response: { status: 404 } };
    });
    await expect(provider.listChanges(cursor('1'))).rejects.toMatchObject({ kind: 'cursor_expired' });
  });
});

describe('GmailMailProvider.sendMessage', () => {
  it('sends base64url RFC 2822 with threadId passed through', async () => {
    const { provider, calls } = providerWith(() => ({ data: { id: 's1', threadId: 'T9', labelIds: ['SENT'] } }));
    const result = await provider.sendMessage({
      from: 'me@example.com',
      to: ['you@example.com'],
      subject: 'Hi',
      text: 'Hello',
      threadId: 'T9',
    });
    expect(result).toEqual({ id: 's1', threadId: 'T9' });
    const call = calls[0] as RequestOptions & { data?: { raw: string; threadId?: string } };
    expect(call.url).toContain('/gmail/v1/users/me/messages/send');
    expect(call.data?.threadId).toBe('T9');
    const mime = Buffer.from(call.data?.raw ?? '', 'base64url').toString('utf8');
    expect(mime).toContain('From: me@example.com\r\n');
    expect(mime).toContain('To: you@example.com\r\n');
    expect(mime).toContain('Subject: Hi\r\n');
    expect(mime).not.toContain('In-Reply-To');
  });

  it('sends by media upload when there are attachments (CONTRACT.md §4.3, v1.3)', async () => {
    const { provider, calls } = providerWith(() => ({ data: { id: 's2', threadId: 'T1', labelIds: ['SENT'] } }));
    const result = await provider.sendMessage({
      from: 'me@example.com',
      to: ['you@example.com'],
      subject: 'Files',
      text: 'Attached',
      threadId: 'T1',
      attachments: [{ filename: 'a.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF') }],
    });
    expect(result).toEqual({ id: 's2', threadId: 'T1' });
    const call = calls[0] as RequestOptions & { data?: { raw?: string } };
    expect(call.url).toContain('/upload/gmail/v1/users/me/messages/send');
    expect(call.params?.uploadType).toBe('multipart');
    expect(call.data?.raw).toBeUndefined();
  });

  it('keeps the raw JSON send for a message with an empty attachment list', async () => {
    const { provider, calls } = providerWith(() => ({ data: { id: 's3', threadId: 'T2', labelIds: ['SENT'] } }));
    await provider.sendMessage({ from: 'me@example.com', to: ['you@example.com'], subject: 'Hi', text: 'Hello', attachments: [] });
    const call = calls[0] as RequestOptions & { data?: { raw?: string } };
    expect(call.url).not.toContain('/upload/');
    expect(typeof call.data?.raw).toBe('string');
  });

  it('maps a 404 to not_found', async () => {
    const { provider } = providerWith(() => {
      throw { response: { status: 404 } };
    });
    await expect(
      provider.sendMessage({ from: 'a@x.io', to: ['b@x.io'], subject: 's', text: 't', threadId: 'nope' }),
    ).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('GmailMailProvider.markRead / markUnread', () => {
  it('removes or adds UNREAD with messages.modify and returns the labels', async () => {
    const { provider, calls } = providerWith((o) => ({
      data: { id: 'm1', labelIds: o.url.endsWith('/modify') && calls.length === 1 ? ['INBOX'] : ['INBOX', 'UNREAD'] },
    }));
    await expect(provider.markRead('m1')).resolves.toEqual({ labels: ['INBOX'] });
    await expect(provider.markUnread('m1')).resolves.toEqual({ labels: ['INBOX', 'UNREAD'] });
    const bodies = calls.map((c) => (c as RequestOptions & { data?: unknown }).data);
    expect(calls[0]?.url).toContain('/gmail/v1/users/me/messages/m1/modify');
    expect(bodies).toEqual([{ removeLabelIds: ['UNREAD'] }, { addLabelIds: ['UNREAD'] }]);
  });
});

describe('GmailMailProvider label changes (CONTRACT.md §4.7)', () => {
  it('modifyLabels sends only the non-empty lists and returns the labels', async () => {
    const { provider, calls } = providerWith(() => ({ data: { id: 'm1', labelIds: ['STARRED'] } }));
    await expect(provider.modifyLabels('m1', { add: ['STARRED'], remove: [] })).resolves.toEqual({ labels: ['STARRED'] });
    expect(calls[0]?.url).toContain('/gmail/v1/users/me/messages/m1/modify');
    expect((calls[0] as RequestOptions & { data?: unknown }).data).toEqual({ addLabelIds: ['STARRED'] });
  });

  it('trash and untrash call their own endpoints', async () => {
    const { provider, calls } = providerWith((o) => ({
      data: { id: 'm1', labelIds: o.url.endsWith('/trash') ? ['TRASH'] : ['INBOX'] },
    }));
    await expect(provider.trash('m1')).resolves.toEqual({ labels: ['TRASH'] });
    await expect(provider.untrash('m1')).resolves.toEqual({ labels: ['INBOX'] });
    expect(calls.map((c) => c.url.replace(/^.*\/messages\//, ''))).toEqual(['m1/trash', 'm1/untrash']);
  });

  it('maps a 400 (e.g. an invalid label ID) to invalid_request', async () => {
    const { provider } = providerWith(() => {
      throw { response: { status: 400, data: { error: { errors: [{ reason: 'invalidArgument' }] } } } };
    });
    await expect(provider.modifyLabels('m1', { add: ['Label_x'], remove: [] })).rejects.toMatchObject({
      kind: 'invalid_request',
    });
  });
});

describe('GmailMailProvider drafts (CONTRACT.md §4.10–§4.12)', () => {
  const draft = { id: 'r-5', message: { id: 'dm1', threadId: 'T3', labelIds: ['DRAFT'] } };

  it('creates and updates a draft with raw MIME and threadId, and deletes it', async () => {
    const { provider, calls } = providerWith(() => ({ data: draft }));
    const outgoing = { from: 'me@example.com', to: [], subject: 'Hi', text: 'x', threadId: 'T3' };
    await expect(provider.createDraft(outgoing)).resolves.toEqual({ draftId: 'r-5', messageId: 'dm1', threadId: 'T3' });
    await expect(provider.updateDraft('r-5', outgoing)).resolves.toEqual({ draftId: 'r-5', messageId: 'dm1', threadId: 'T3' });
    await expect(provider.deleteDraft('r-5')).resolves.toBeUndefined();

    expect(calls[0]?.url).toMatch(/\/gmail\/v1\/users\/me\/drafts$/);
    expect(calls[1]?.url).toMatch(/\/gmail\/v1\/users\/me\/drafts\/r-5$/);
    expect(calls[2]?.url).toMatch(/\/gmail\/v1\/users\/me\/drafts\/r-5$/);
    const body = (calls[0] as RequestOptions & { data?: { message: { raw: string; threadId?: string } } }).data;
    expect(body?.message.threadId).toBe('T3');
    const mime = Buffer.from(body?.message.raw ?? '', 'base64url').toString('utf8');
    expect(mime).toContain('Subject: Hi\r\n');
    expect(mime).not.toContain('To:');
  });

  it('rejects a response without the draft or message ID as upstream', async () => {
    const { provider } = providerWith(() => ({ data: { id: 'r-5' } }));
    await expect(provider.createDraft({ from: 'a@x.io', to: [], subject: '', text: '' })).rejects.toMatchObject({
      kind: 'upstream',
    });
  });
});

describe('GmailMailProvider.listDrafts (CONTRACT.md §4.13)', () => {
  const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');
  const full = (id: string, headers: Array<{ name: string; value: string }>, body: string | null) => ({
    id,
    message: {
      id: `m-${id}`,
      threadId: `t-${id}`,
      labelIds: ['DRAFT'],
      historyId: '42',
      internalDate: '1791800000000',
      payload: { mimeType: 'text/plain', headers, body: body === null ? { size: 0 } : { data: b64(body) } },
    },
  });

  it('lists one page, gets each draft in full and maps it to the DraftDTO fields', async () => {
    const { provider, calls } = providerWith((o) => {
      if (/\/drafts$/.test(o.url)) {
        return { data: { drafts: [{ id: 'r-1' }, { id: 'r-2' }], nextPageToken: 'p2' } };
      }
      const id = o.url.split('/').pop() ?? '';
      return {
        data:
          id === 'r-1'
            ? full('r-1', [{ name: 'To', value: 'Ada <ada@x.io>, bob@y.io' }, { name: 'Subject', value: 'Hi' }], 'Body')
            : full('r-2', [], null),
      };
    });
    await expect(provider.listDrafts({ limit: 2, pageToken: 'p1' })).resolves.toEqual({
      drafts: [
        { draftId: 'r-1', messageId: 'm-r-1', threadId: 't-r-1', to: ['Ada <ada@x.io>', 'bob@y.io'], subject: 'Hi', body: 'Body', updatedAt: new Date(1791800000000) },
        { draftId: 'r-2', messageId: 'm-r-2', threadId: 't-r-2', to: [], subject: '', body: '', updatedAt: new Date(1791800000000) },
      ],
      nextPageToken: 'p2',
    });
    expect(calls[0]?.params).toMatchObject({ maxResults: 2, pageToken: 'p1' });
    expect(calls.slice(1).map((c) => c.params?.format)).toEqual(['full', 'full']);
  });

  it('skips a draft deleted between the list and its get', async () => {
    const { provider } = providerWith((o) => {
      if (/\/drafts$/.test(o.url)) {
        return { data: { drafts: [{ id: 'r-1' }, { id: 'gone' }] } };
      }
      if (o.url.endsWith('/gone')) {
        throw { response: { status: 404 } };
      }
      return { data: full('r-1', [], 'x') };
    });
    const page = await provider.listDrafts({ limit: 25, pageToken: null });
    expect(page.drafts.map((d) => d.draftId)).toEqual(['r-1']);
    expect(page.nextPageToken).toBeNull();
  });

  it('handles an empty draft list', async () => {
    const { provider, calls } = providerWith(() => ({ data: {} }));
    await expect(provider.listDrafts({ limit: 25, pageToken: null })).resolves.toEqual({ drafts: [], nextPageToken: null });
    expect(calls).toHaveLength(1);
  });
});

describe('GmailMailProvider.getAttachment (CONTRACT.md §4.15)', () => {
  const pdf = Buffer.from('%PDF-1.7 bytes');
  const message = (parts: unknown[]) => ({
    data: { id: 'm1', threadId: 't1', historyId: '9', internalDate: '0', payload: { mimeType: 'multipart/mixed', parts } },
  });

  it("looks the part's attachment ID up fresh, then fetches and decodes the bytes", async () => {
    const { provider, calls } = providerWith((options) =>
      options.url.includes('/attachments/')
        ? { data: { data: pdf.toString('base64url'), size: pdf.length } }
        : message([
            { partId: '0', mimeType: 'text/plain', body: { data: 'aGk' } },
            { partId: '1', filename: 'a.pdf', mimeType: 'application/pdf', body: { attachmentId: 'FRESH-ID', size: pdf.length } },
          ]),
    );
    await expect(provider.getAttachment('m1', '1')).resolves.toEqual(pdf);
    expect(calls[0]?.url).toContain('/gmail/v1/users/me/messages/m1');
    expect(calls[1]?.url).toContain('/gmail/v1/users/me/messages/m1/attachments/FRESH-ID');
  });

  it('uses inline part data without a second request', async () => {
    const { provider, calls } = providerWith(() =>
      message([{ partId: '0', mimeType: 'multipart/alternative', parts: [{ partId: '0.1', filename: 'n.txt', body: { data: Buffer.from('note').toString('base64url') } }] }]),
    );
    await expect(provider.getAttachment('m1', '0.1')).resolves.toEqual(Buffer.from('note'));
    expect(calls).toHaveLength(1);
  });

  it('rejects with not_found when the part is gone', async () => {
    const { provider } = providerWith(() => message([{ partId: '1', filename: 'a.pdf', body: { attachmentId: 'X' } }]));
    await expect(provider.getAttachment('m1', '2')).rejects.toMatchObject({ kind: 'not_found' });
  });
});
