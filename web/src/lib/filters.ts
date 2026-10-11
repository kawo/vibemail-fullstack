import type { MessageDTO } from '../api/types';

/**
 * Label filter (DESIGN_SPEC.md §4): client-side only, on `status`, `isStarred` and `labelIds`.
 * `status` is read, never computed or set here. Drafts is a label in the sidebar but not a filter:
 * drafts are never stored messages (CONTRACT.md §3.5), so it shows the draft list (§4.13) instead.
 */

export type Chip =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'drafts' }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'label'; labelId: string };

/** The five fixed labels, always rendered first and in this order. */
export const FIXED_CHIPS: readonly Chip[] = [{ kind: 'all' }, { kind: 'starred' }, { kind: 'drafts' }, { kind: 'archive' }, { kind: 'trash' }];

const notTrashOrSpam = (m: MessageDTO) => m.status !== 'trash' && m.status !== 'spam';

export function matchesChip(message: MessageDTO, chip: Chip): boolean {
  switch (chip.kind) {
    case 'all':
      return notTrashOrSpam(message);
    case 'starred':
      return message.isStarred && notTrashOrSpam(message);
    case 'drafts':
      return false; // Drafts are never stored messages; Drafts shows the draft list.
    case 'archive':
      return message.status === 'archived';
    case 'trash':
      return message.status === 'trash';
    case 'label':
      return message.labelIds.includes(chip.labelId) && notTrashOrSpam(message);
  }
}

/** Custom Gmail labels across the loaded messages: IDs starting with `Label_`, sorted. */
export function customLabelIds(messages: readonly MessageDTO[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const label of message.labelIds) {
      if (label.startsWith('Label_')) {
        ids.add(label);
      }
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * How many loaded messages each label matches, keyed by `chipKey`. All counts only new (unread)
 * messages; every other label counts all its matches. Counts cover only mail VibeMail has synced
 * and loaded (the contract has no count endpoint), the same set the label filter works on.
 */
export function chipCounts(messages: readonly MessageDTO[], chips: readonly Chip[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const chip of chips) {
    let n = 0;
    for (const message of messages) {
      if (matchesChip(message, chip) && (chip.kind !== 'all' || !message.isRead)) {
        n += 1;
      }
    }
    counts.set(chipKey(chip), n);
  }
  return counts;
}

/** The sidebar shows a count on every label that has one; a zero shows nothing. */
export function showsCount(count: number): boolean {
  return count > 0;
}

/** The count's accessible wording: All counts new messages, Drafts counts drafts, the rest messages. */
export function countNoun(chip: Chip, count: number): string {
  if (chip.kind === 'drafts') {
    return count === 1 ? 'draft' : 'drafts';
  }
  const noun = count === 1 ? 'message' : 'messages';
  return chip.kind === 'all' ? `new ${noun}` : noun;
}

/** The number as shown: `999+` past 999, and a `+` while more of an open-ended list is unread. */
export function countText(count: number, more = false): string {
  return count > 999 ? '999+' : more ? `${count}+` : String(count);
}

export function chipKey(chip: Chip): string {
  return chip.kind === 'label' ? `label:${chip.labelId}` : chip.kind;
}

export function chipLabel(chip: Chip): string {
  switch (chip.kind) {
    case 'all':
      return 'All';
    case 'starred':
      return 'Starred';
    case 'drafts':
      return 'Drafts';
    case 'archive':
      return 'Archive';
    case 'trash':
      return 'Trash';
    case 'label':
      // The contract has no label-name endpoint, so a custom chip shows its label ID.
      return chip.labelId;
  }
}

export function emptyStateText(chip: Chip): string | null {
  switch (chip.kind) {
    case 'all':
      return null; // The inbox empty state applies.
    case 'starred':
      return 'No starred messages.';
    case 'drafts':
      return 'No drafts.';
    case 'archive':
      return 'Nothing in Archive.';
    case 'trash':
      return 'Trash is empty.';
    case 'label':
      return 'No messages with this label.';
  }
}

/** Fill rule: keep paging until 25 matches, five extra pages, or no `nextCursor`. */
export const FILL_TARGET = 25;
export const FILL_MAX_PAGES = 5;

export function shouldFill(matches: number, pagesFetched: number, nextCursor: string | null): boolean {
  return matches < FILL_TARGET && pagesFetched < FILL_MAX_PAGES && nextCursor !== null;
}
