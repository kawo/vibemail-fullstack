import { describe, expect, it } from 'vitest';
import { bulkSummary, bulkTargets, keepsSelection, readToggle, selectAllState, toggleSelection } from '@/lib/selection';
import { message } from '@/lib/__tests__/fixtures';

describe('multi-select (DESIGN_SPEC.md §1 Selection)', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('toggles one message', () => {
    const on = toggleSelection(new Set(), 'b');
    expect([...on]).toEqual(['b']);
    expect([...toggleSelection(on, 'b')]).toEqual([]);
  });

  it('Shift selects the range from the last toggled message, in either direction', () => {
    expect([...toggleSelection(new Set(['b']), 'd', { range: true, anchor: 'b', order })].sort()).toEqual(['b', 'c', 'd']);
    expect([...toggleSelection(new Set(['d']), 'a', { range: true, anchor: 'd', order })].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Shift on a selected message clears the range', () => {
    const all = new Set(order);
    expect([...toggleSelection(all, 'd', { range: true, anchor: 'b', order })].sort()).toEqual(['a', 'e']);
  });

  it('without a usable anchor, Shift toggles just the one', () => {
    expect([...toggleSelection(new Set(), 'c', { range: true, anchor: 'gone', order })]).toEqual(['c']);
  });

  it('applies each action only to the messages it can change', () => {
    const read = message({ gmailId: 'r', isRead: true });
    const unread = message({ gmailId: 'u', isRead: false });
    const archived = message({ gmailId: 'a', status: 'archived' });
    const trashed = message({ gmailId: 't', status: 'trash' });
    const sent = message({ gmailId: 's', status: 'sent' });
    const all = [read, unread, archived, trashed, sent];
    const ids = (kind: Parameters<typeof bulkTargets>[0]) => bulkTargets(kind, all).map((m) => m.gmailId);
    expect(ids('unread')).toEqual(['r', 'a', 't', 's']);
    expect(ids('read')).toEqual(['u']);
    expect(ids('archive')).toEqual(['r', 'u']);
    expect(ids('trash')).toEqual(['r', 'u', 'a', 's']);
    expect(ids('restore')).toEqual(['t']);
  });

  it('the read button marks unread until every selected message is unread, then marks read', () => {
    const read = message({ gmailId: 'r', isRead: true });
    const unread = message({ gmailId: 'u', isRead: false });
    expect(readToggle([read, unread])).toBe('unread');
    expect(readToggle([unread])).toBe('read');
    expect(keepsSelection('read')).toBe(true);
    expect(keepsSelection('unread')).toBe(true);
    expect(keepsSelection('archive')).toBe(false);
  });

  it('summarises the outcome in one line', () => {
    expect(bulkSummary('archive', 3, 3)).toBe('3 messages archived');
    expect(bulkSummary('trash', 1, 1)).toBe('1 message moved to Trash');
    expect(bulkSummary('unread', 2, 3)).toBe('2 of 3 messages marked unread');
  });

  it('shows the select-all box as none, some or all', () => {
    expect(selectAllState(0, 8)).toBe('none');
    expect(selectAllState(3, 8)).toBe('some');
    expect(selectAllState(8, 8)).toBe('all');
  });
});
