import { toMessageRow } from '../../src/db/messages';
import { deriveStatus } from '../../src/db/status';
import { toMessageDTO } from '../../src/messages/dto';
import { fakeMessage } from '../fakes/fakeProvider';

describe('deriveStatus (CONTRACT.md §3.4)', () => {
  it.each([
    [['INBOX', 'TRASH'], 'trash'],
    [['SPAM', 'INBOX'], 'spam'],
    [['TRASH', 'SPAM'], 'trash'],
    [['INBOX', 'SENT', 'UNREAD'], 'inbox'],
    [['SENT'], 'sent'],
    [['STARRED', 'Label_1'], 'archived'],
    [[], 'archived'],
  ])('%j → %s (first matching rule wins)', (labels, status) => {
    expect(deriveStatus(labels)).toBe(status);
  });

  it('is written on every mapped row and exposed on the DTO', () => {
    const row = toMessageRow('u', fakeMessage({ id: 'm1', labels: ['SENT'] }), new Date());
    expect(row.status).toBe('sent');
    expect(toMessageDTO(row).status).toBe('sent');
  });
});
