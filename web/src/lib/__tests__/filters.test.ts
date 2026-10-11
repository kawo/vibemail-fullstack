import { describe, expect, it } from 'vitest';
import { type Chip, FIXED_CHIPS, chipCounts, chipLabel, countNoun, countText, customLabelIds, matchesChip, shouldFill, showsCount } from '../filters';
import { message } from './fixtures';

describe('label filter (DESIGN_SPEC.md §4)', () => {
  const inbox = message({ gmailId: 'a' });
  const starred = message({ gmailId: 'b', isStarred: true, labelIds: ['INBOX', 'STARRED', 'Label_2'] });
  const archived = message({ gmailId: 'c', status: 'archived', labelIds: ['Label_1'] });
  const trashed = message({ gmailId: 'd', status: 'trash', isStarred: true, labelIds: ['TRASH', 'STARRED', 'Label_1'] });
  const spam = message({ gmailId: 'e', status: 'spam', labelIds: ['SPAM'] });
  const sent = message({ gmailId: 'f', status: 'sent', labelIds: ['SENT'] });
  const all = [inbox, starred, archived, trashed, spam, sent];
  const ids = (chip: Chip) => all.filter((m) => matchesChip(m, chip)).map((m) => m.gmailId);

  it('always has the five fixed labels first, in order', () => {
    expect(FIXED_CHIPS.map(chipLabel)).toEqual(['All', 'Starred', 'Drafts', 'Archive', 'Trash']);
  });

  it('All excludes trash and spam', () => expect(ids({ kind: 'all' })).toEqual(['a', 'b', 'c', 'f']));
  it('Starred excludes a starred message in the trash', () => expect(ids({ kind: 'starred' })).toEqual(['b']));
  it('Archive is status archived', () => expect(ids({ kind: 'archive' })).toEqual(['c']));
  it('Trash is status trash', () => expect(ids({ kind: 'trash' })).toEqual(['d']));
  it('a custom label matches labelIds, outside trash and spam', () => {
    expect(ids({ kind: 'label', labelId: 'Label_1' })).toEqual(['c']);
  });

  it('counts each label with the same rule as the filter', () => {
    const chips: Chip[] = [...FIXED_CHIPS, { kind: 'label', labelId: 'Label_1' }, { kind: 'label', labelId: 'Label_2' }];
    expect(Object.fromEntries(chipCounts(all, chips))).toEqual({
      all: 0,
      starred: 1,
      drafts: 0,
      archive: 1,
      trash: 1,
      'label:Label_1': 1,
      'label:Label_2': 1,
    });
  });

  it('All counts only new (unread) messages, outside trash and spam', () => {
    const unread = [
      message({ gmailId: 'u1', isRead: false }),
      message({ gmailId: 'u2', isRead: false, status: 'archived' }),
      message({ gmailId: 'u3', isRead: false, status: 'trash' }),
      message({ gmailId: 'r1', isRead: true }),
    ];
    expect(chipCounts(unread, [{ kind: 'all' }]).get('all')).toBe(2);
  });

  it('never shows a zero, and words the count for screen readers', () => {
    expect(showsCount(0)).toBe(false);
    expect(showsCount(2)).toBe(true);
    expect(countNoun({ kind: 'all' }, 1)).toBe('new message');
    expect(countNoun({ kind: 'starred' }, 2)).toBe('messages');
    expect(countNoun({ kind: 'drafts' }, 1)).toBe('draft');
  });

  it('Drafts never matches a stored message', () => expect(ids({ kind: 'drafts' })).toEqual([]));

  it('writes the count, open-ended while more drafts are unread', () => {
    expect(countText(3)).toBe('3');
    expect(countText(25, true)).toBe('25+');
    expect(countText(1200)).toBe('999+');
  });

  it('lists custom labels (Label_*) from loaded messages, sorted, and shows the ID', () => {
    expect(customLabelIds(all)).toEqual(['Label_1', 'Label_2']);
    expect(chipLabel({ kind: 'label', labelId: 'Label_2' })).toBe('Label_2');
  });

  it('fills until 25 matches, five extra pages, or no cursor', () => {
    expect(shouldFill(3, 0, 'c')).toBe(true);
    expect(shouldFill(25, 0, 'c')).toBe(false);
    expect(shouldFill(3, 5, 'c')).toBe(false);
    expect(shouldFill(3, 0, null)).toBe(false);
  });
});
