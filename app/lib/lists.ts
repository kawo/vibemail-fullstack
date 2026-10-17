import type { ApiError } from '@/app/services/errors';
import type { MessageDTO } from '@/app/services/types';
import { type Chip, chipKey, matchesChip } from '@/app/lib/filters';

/**
 * One server-filtered list per label (DESIGN_SPEC.md §4, CONTRACT.md §4.2 `label`). The server
 * decides which messages a list holds; the client only keeps lists in step with message changes
 * it caused or received (a `PATCH` that archives, a message just sent).
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface ListState {
  /** Server order: `(internalDate DESC, gmailId DESC)`. */
  ids: string[];
  nextCursor: string | null;
  lastSyncedAt: string | null;
  state: LoadState;
  error: ApiError | null;
  loadingMore: boolean;
  moreError: ApiError | null;
  refreshing: boolean;
}

export function emptyList(): ListState {
  return { ids: [], nextCursor: null, lastSyncedAt: null, state: 'idle', error: null, loadingMore: false, moreError: null, refreshing: false };
}

/** Server order: newer first, then the larger `gmailId`. */
function before(a: MessageDTO, b: MessageDTO): boolean {
  return a.internalDate > b.internalDate || (a.internalDate === b.internalDate && a.gmailId > b.gmailId);
}

/**
 * Puts `message` where it now belongs: out of every list whose label it no longer matches, and
 * into every loaded list it now matches, at its date position. A list with more pages to load
 * only takes it when it falls within the loaded range; a later page brings older ones. Lists
 * that don't change keep their object.
 */
export function placeInLists(
  lists: ReadonlyMap<string, ListState>,
  chips: readonly Chip[],
  message: MessageDTO,
  cache: ReadonlyMap<string, MessageDTO>,
): Map<string, ListState> {
  const next = new Map(lists);
  for (const chip of chips) {
    const key = chipKey(chip);
    const list = lists.get(key);
    if (!list || list.state !== 'ready') {
      continue;
    }
    const present = list.ids.includes(message.gmailId);
    const belongs = matchesChip(message, chip);
    if (present && !belongs) {
      next.set(key, { ...list, ids: list.ids.filter((id) => id !== message.gmailId) });
    } else if (!present && belongs) {
      const loaded = list.ids.map((id) => cache.get(id)).filter((m): m is MessageDTO => m !== undefined);
      const at = loaded.findIndex((other) => before(message, other));
      if (at === -1 && list.nextCursor !== null) {
        continue; // Older than everything loaded: a later page holds it.
      }
      const ids = [...list.ids];
      ids.splice(at === -1 ? ids.length : ids.indexOf(loaded[at]!.gmailId), 0, message.gmailId);
      next.set(key, { ...list, ids });
    }
  }
  return next;
}
