import { describe, expect, it } from 'vitest';
import type { MessageDTO } from '@/app/services/types';
import { type Chip, chipKey, chipParam } from '@/app/lib/filters';
import { type ListState, emptyList, placeInLists } from '@/app/lib/lists';
import { message } from '@/app/lib/__tests__/fixtures';

const ALL: Chip = { kind: 'all' };
const STARRED: Chip = { kind: 'starred' };
const ARCHIVE: Chip = { kind: 'archive' };
const LABEL7: Chip = { kind: 'label', labelId: 'Label_7' };
const CHIPS = [ALL, STARRED, ARCHIVE, LABEL7];

const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const ready = (ids: string[], nextCursor: string | null = null): ListState => ({ ...emptyList(), ids, nextCursor, state: 'ready' });

/** Cache and lists for: m5 (newest) … m1, all in the inbox; m4 also has Label_7. */
function setup() {
  const cache = new Map<string, MessageDTO>();
  for (const day of [1, 2, 3, 4, 5]) {
    const labelIds = day === 4 ? ['INBOX', 'Label_7'] : ['INBOX'];
    cache.set(`m${day}`, message({ gmailId: `m${day}`, internalDate: at(day), labelIds }));
  }
  cache.set('a9', message({ gmailId: 'a9', internalDate: at(9), status: 'archived', labelIds: [] }));
  const lists = new Map<string, ListState>([
    [chipKey(ALL), ready(['m5', 'm4', 'm3', 'm2', 'm1'])],
    [chipKey(ARCHIVE), ready(['a9'])],
    [chipKey(LABEL7), ready(['m4'])],
  ]);
  return { cache, lists };
}

const ids = (lists: ReadonlyMap<string, ListState>, chip: Chip) => lists.get(chipKey(chip))?.ids;

describe('one list per label (DESIGN_SPEC.md §4)', () => {
  it('adds an archived message to Archive at its date position, and keeps it in All (All is everything but trash and spam)', () => {
    const { cache, lists } = setup();
    const archived = { ...cache.get('m3')!, status: 'archived' as const, labelIds: [] };
    cache.set('m3', archived);
    const next = placeInLists(lists, CHIPS, archived, cache);
    expect(ids(next, ALL)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
    expect(ids(next, ARCHIVE)).toEqual(['a9', 'm3']);
  });

  it('takes a restored message out of Archive', () => {
    const { cache, lists } = setup();
    const restored = { ...cache.get('a9')!, status: 'inbox' as const, labelIds: ['INBOX'] };
    cache.set('a9', restored);
    const next = placeInLists(lists, CHIPS, restored, cache);
    expect(ids(next, ARCHIVE)).toEqual([]);
    expect(ids(next, ALL)).toEqual(['a9', 'm5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('takes a trashed message out of every list it was in', () => {
    const { cache, lists } = setup();
    const trashed = { ...cache.get('m4')!, status: 'trash' as const, labelIds: ['TRASH', 'Label_7'] };
    cache.set('m4', trashed);
    const next = placeInLists(lists, CHIPS, trashed, cache);
    expect(ids(next, ALL)).toEqual(['m5', 'm3', 'm2', 'm1']);
    expect(ids(next, LABEL7)).toEqual([]);
  });

  it('adds a newly starred message to a loaded Starred list, and leaves unloaded lists alone', () => {
    const { cache, lists } = setup();
    lists.set(chipKey(STARRED), ready([]));
    const starred = { ...cache.get('m2')!, isStarred: true, labelIds: ['INBOX', 'STARRED'] };
    cache.set('m2', starred);
    const next = placeInLists(lists, CHIPS, starred, cache);
    expect(ids(next, STARRED)).toEqual(['m2']);

    const idle = new Map(lists);
    idle.set(chipKey(STARRED), emptyList());
    expect(ids(placeInLists(idle, CHIPS, starred, cache), STARRED)).toEqual([]);
  });

  it('does not insert a message older than a partly loaded list reaches', () => {
    const { cache, lists } = setup();
    lists.set(chipKey(ARCHIVE), ready(['a9'], 'more'));
    const old = { ...cache.get('m1')!, status: 'archived' as const, labelIds: [] };
    cache.set('m1', old);
    // a9 is the oldest loaded; m1 is older and later pages hold it: it isn't added here.
    expect(ids(placeInLists(lists, CHIPS, old, cache), ARCHIVE)).toEqual(['a9']);
  });

  it('keeps the list object when nothing changes', () => {
    const { cache, lists } = setup();
    const next = placeInLists(lists, CHIPS, cache.get('m5')!, cache);
    expect(next.get(chipKey(ALL))).toBe(lists.get(chipKey(ALL)));
  });

  it('sends each chip as the API label', () => {
    expect([ALL, STARRED, ARCHIVE, { kind: 'trash' } as Chip, LABEL7].map(chipParam)).toEqual([
      'all',
      'starred',
      'archive',
      'trash',
      'Label_7',
    ]);
  });
});
