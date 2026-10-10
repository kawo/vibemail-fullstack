import type { MessageDTO } from '../../api/types';

export function message(overrides: Partial<MessageDTO> & { gmailId: string }): MessageDTO {
  return {
    threadId: overrides.gmailId,
    labelIds: ['INBOX'],
    status: 'inbox',
    isRead: true,
    isStarred: false,
    snippet: 'snippet',
    historyId: '1',
    internalDate: '2026-10-10T10:00:00.000Z',
    sizeEstimate: 100,
    subject: 'Subject',
    fromAddress: 'Ada Lovelace <ada@example.com>',
    toAddress: ['me@example.com'],
    ccAddresses: [],
    bccAddresses: [],
    rfc822MessageId: null,
    inReplyTo: null,
    references: null,
    dateHeader: 'Sat, 10 Oct 2026 10:00:00 +0000',
    bodyPlain: 'Line one\nLine two',
    bodyHtml: null,
    attachments: [],
    syncedAt: '2026-10-10T10:00:00.000Z',
    ...overrides,
  };
}
