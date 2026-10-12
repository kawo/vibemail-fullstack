import type { MessageDTO } from '../api/types';

/**
 * Multi-select (DESIGN_SPEC.md §1 Selection). The contract has no batch endpoint (CONTRACT.md §1
 * out of scope), so a bulk action is one `PATCH /api/v1/messages/{id}` per message, in order.
 */

export type BulkKind = 'unread' | 'archive' | 'trash' | 'restore';

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

/** The select-all box: checked when every listed message is selected, mixed when some are. */
export function selectAllState(selectedVisible: number, visible: number): 'none' | 'some' | 'all' {
  if (selectedVisible === 0) {
    return 'none';
  }
  return selectedVisible === visible ? 'all' : 'some';
}
