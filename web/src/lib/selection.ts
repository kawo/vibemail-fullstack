import type { MessageDTO } from '../api/types';

/**
 * Multi-select (DESIGN_SPEC.md §1 Selection). The contract has no batch endpoint (CONTRACT.md §1
 * out of scope), so a bulk action is one `PATCH /api/v1/messages/{id}` per message, in order.
 */

export type BulkKind = 'read' | 'unread' | 'archive' | 'trash' | 'restore';

/**
 * Toggles one message. With `range`, every message between the last one toggled (`anchor`) and
 * this one, in list order, takes this one's new state, as Shift-click does in a file list.
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
  options: { range?: boolean; anchor?: string | null; order?: readonly string[] } = {},
): Set<string> {
  const next = new Set(selected);
  const on = !selected.has(id);
  const order = options.order ?? [];
  const from = options.anchor ? order.indexOf(options.anchor) : -1;
  const to = order.indexOf(id);
  const ids = options.range && from >= 0 && to >= 0 ? order.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
  for (const each of ids) {
    if (on) {
      next.add(each);
    } else {
      next.delete(each);
    }
  }
  return next;
}

/** The messages an action applies to; the rest of the selection is left as it is. */
export function bulkTargets(kind: BulkKind, messages: readonly MessageDTO[]): MessageDTO[] {
  switch (kind) {
    case 'read':
      return messages.filter((m) => !m.isRead);
    case 'unread':
      return messages.filter((m) => m.isRead);
    case 'archive':
      return messages.filter((m) => m.status === 'inbox');
    case 'trash':
      return messages.filter((m) => m.status !== 'trash');
    case 'restore':
      return messages.filter((m) => m.status === 'trash');
  }
}

const DONE: Record<BulkKind, string> = {
  read: 'marked read',
  unread: 'marked unread',
  archive: 'archived',
  trash: 'moved to Trash',
  restore: 'restored',
};

/** "3 messages archived", or "2 of 3 messages archived" when some failed. */
export function bulkSummary(kind: BulkKind, done: number, total: number): string {
  const noun = total === 1 ? 'message' : 'messages';
  return done === total ? `${total} ${noun} ${DONE[kind]}` : `${done} of ${total} ${noun} ${DONE[kind]}`;
}

/**
 * The read toggle: Mark unread while any selected message is read; once every one is unread,
 * the same button marks them read.
 */
export function readToggle(messages: readonly MessageDTO[]): 'read' | 'unread' {
  return messages.length > 0 && messages.every((m) => !m.isRead) ? 'read' : 'unread';
}

/** Read and unread leave the messages where they are, so the selection stays for the next click. */
export function keepsSelection(kind: BulkKind): boolean {
  return kind === 'read' || kind === 'unread';
}

/** The select-all box: checked when every listed message is selected, mixed when some are. */
export function selectAllState(selectedVisible: number, visible: number): 'none' | 'some' | 'all' {
  if (selectedVisible === 0) {
    return 'none';
  }
  return selectedVisible === visible ? 'all' : 'some';
}
