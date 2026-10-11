import type { MessageDTO } from '../api/types';

/**
 * Label filter (DESIGN_SPEC.md §4): client-side only, on `status`, `isStarred` and `labelIds`.
 * `status` is read, never computed or set here.
 */

export type Chip =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'label'; labelId: string };

/** The four fixed chips, always rendered first and in this order. */
export const FIXED_CHIPS: readonly Chip[] = [{ kind: 'all' }, { kind: 'starred' }, { kind: 'archive' }, { kind: 'trash' }];

const notTrashOrSpam = (m: MessageDTO) => m.status !== 'trash' && m.status !== 'spam';

export function matchesChip(message: MessageDTO, chip: Chip): boolean {
  switch (chip.kind) {
    case 'all':
      return notTrashOrSpam(message);
    case 'starred':
      return message.isStarred && notTrashOrSpam(message);
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
 * How many loaded messages each label matches, keyed by `chipKey`. Counts cover only mail
 * VibeMail has synced and loaded (the contract has no count endpoint), the same set the label
 * filter works on.
 */
export function chipCounts(messages: readonly MessageDTO[], chips: readonly Chip[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const chip of chips) {
    let n = 0;
    for (const message of messages) {
      if (matchesChip(message, chip)) {
        n += 1;
      }
    }
    counts.set(chipKey(chip), n);
  }
  return counts;
}

/** The sidebar shows a count on every label except All; a zero shows nothing. */
export function showsCount(chip: Chip, count: number): boolean {
  return chip.kind !== 'all' && count > 0;
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
