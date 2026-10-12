import { ApiError, api } from '@/services';
import type { MessageDTO, UpdateLabelsRequest } from '@/services/types';
import { type BulkKind, bulkSummary, bulkTargets } from '@/lib/selection';
import { asApiError, store } from '@/state/store';

/**
 * Message actions shared by the inbox, thread view and search (DESIGN_SPEC.md §1 User actions).
 * Label changes go through `PATCH /api/v1/messages/{id}`; the returned `message` replaces the
 * cached one, so `status` always comes from the server.
 */

function reportFailure(error: ApiError, gmailId: string): void {
  switch (error.code) {
    case 'UNAUTHENTICATED':
    case 'GMAIL_NOT_CONNECTED':
    case 'GMAIL_TOKEN_REVOKED':
      return; // The shared rules handle these: sign-in screen or reconnect panel.
    case 'VALIDATION_FAILED':
      store.toast('That change isn’t allowed');
      return;
    case 'MESSAGE_NOT_FOUND':
      store.remove(gmailId);
      store.toast('This message no longer exists');
      return;
    case 'GMAIL_RATE_LIMITED':
      store.toast(`Gmail is busy, try again in ${error.retryAfterSeconds ?? 30}s`);
      return;
    default:
      store.toast('Couldn’t update the message');
  }
}

/** Sends a label change, keeping the row pending until the server's `message` replaces it. */
export async function changeLabels(gmailId: string, change: UpdateLabelsRequest): Promise<MessageDTO | null> {
  const result = await tryChangeLabels(gmailId, change);
  if (result instanceof ApiError) {
    reportFailure(result, gmailId);
    return null;
  }
  return result;
}

/** `changeLabels` that hands the error back instead of reporting it (bulk actions sum them up). */
async function tryChangeLabels(gmailId: string, change: UpdateLabelsRequest): Promise<MessageDTO | ApiError> {
  store.setPending(gmailId, true);
  try {
    const { message } = await api.updateLabels(gmailId, change);
    store.upsert(message);
    return message;
  } catch (error) {
    store.setOverride(gmailId, null);
    return asApiError(error);
  } finally {
    store.setPending(gmailId, false);
  }
}

/** The star icon toggles at once; the server's answer replaces it, or it reverts on failure. */
export function toggleStar(message: MessageDTO): Promise<MessageDTO | null> {
  const next = !message.isStarred;
  store.setOverride(message.gmailId, { isStarred: next });
  return changeLabels(message.gmailId, next ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] });
}

export function markUnread(message: MessageDTO): Promise<MessageDTO | null> {
  store.setOverride(message.gmailId, { isRead: false });
  return changeLabels(message.gmailId, { addLabelIds: ['UNREAD'] });
}

type Move = 'archive' | 'trash' | 'restore';

const MOVES: Record<Move, { change: UpdateLabelsRequest; undo: UpdateLabelsRequest; done: string }> = {
  archive: { change: { removeLabelIds: ['INBOX'] }, undo: { addLabelIds: ['INBOX'] }, done: 'Archived' },
  trash: { change: { addLabelIds: ['TRASH'] }, undo: { removeLabelIds: ['TRASH'] }, done: 'Moved to Trash' },
  restore: { change: { removeLabelIds: ['TRASH'] }, undo: { addLabelIds: ['TRASH'] }, done: 'Restored' },
};

/** Archive, trash and restore, with a 5-second Undo that sends the inverse PATCH. */
export async function move(message: MessageDTO, kind: Move, options: { undo?: boolean } = { undo: true }): Promise<boolean> {
  const { change, undo, done } = MOVES[kind];
  const result = await changeLabels(message.gmailId, change);
  if (result && options.undo !== false) {
    store.toast(done, { ttl: 5000, action: { label: 'Undo', run: () => void changeLabels(message.gmailId, undo) } });
  }
  return result !== null;
}

const BULK: Record<Exclude<BulkKind, 'read'>, { change: UpdateLabelsRequest; undo: UpdateLabelsRequest | null }> = {
  unread: { change: { addLabelIds: ['UNREAD'] }, undo: null },
  archive: MOVES.archive,
  trash: MOVES.trash,
  restore: MOVES.restore,
};

/** Errors after which the rest of a bulk action would fail the same way. */
const STOPS: ReadonlySet<string> = new Set(['UNAUTHENTICATED', 'GMAIL_NOT_CONNECTED', 'GMAIL_TOKEN_REVOKED', 'GMAIL_RATE_LIMITED']);

/**
 * A bulk action over selected messages (DESIGN_SPEC.md §1 Selection): one `PATCH` per message,
 * one at a time, since the contract has no batch endpoint. Every affected row dims at once and
 * comes back from the server's `message`. A sign-in, reconnect or rate-limit error stops the rest.
 * One toast sums it up, with an Undo that sends the inverse change for those that succeeded.
 */
export async function bulk(kind: BulkKind, messages: readonly MessageDTO[]): Promise<void> {
  const targets = bulkTargets(kind, messages);
  if (targets.length === 0) {
    return;
  }
  const undo = kind === 'read' ? null : BULK[kind].undo;
  // Marking read goes through `POST /api/v1/messages/{id}/read`; everything else is a label PATCH.
  const apply = (m: MessageDTO) => (kind === 'read' ? tryMarkRead(m) : tryChangeLabels(m.gmailId, BULK[kind].change));
  for (const m of targets) {
    store.setPending(m.gmailId, true);
    if (kind === 'unread' || kind === 'read') {
      store.setOverride(m.gmailId, { isRead: kind === 'read' });
    }
  }
  const done: string[] = [];
  let stop: ApiError | null = null;
  let missing = 0;
  for (const m of targets) {
    if (stop) {
      store.setPending(m.gmailId, false);
      store.setOverride(m.gmailId, null);
      continue;
    }
    const result = await apply(m);
    if (!(result instanceof ApiError)) {
      done.push(m.gmailId);
    } else if (STOPS.has(result.code)) {
      stop = result;
    } else if (result.code === 'MESSAGE_NOT_FOUND') {
      store.remove(m.gmailId);
      missing += 1;
    }
  }
  if (stop?.code === 'GMAIL_RATE_LIMITED') {
    store.toast(`Gmail is busy, try again in ${stop.retryAfterSeconds ?? 30}s. ${bulkSummary(kind, done.length, targets.length)}`);
    return;
  }
  if (stop) {
    return; // The shared rules show the sign-in screen or reconnect panel.
  }
  const text =
    done.length === targets.length
      ? bulkSummary(kind, done.length, targets.length)
      : `${bulkSummary(kind, done.length, targets.length)}. ${missing === targets.length - done.length ? 'The rest no longer exist.' : 'Couldn’t update the rest.'}`;
  const inverse = undo;
  store.toast(text, {
    ttl: 5000,
    ...(inverse && done.length > 0
      ? {
          action: {
            label: 'Undo',
            run: () =>
              void (async () => {
                for (const id of done) {
                  await changeLabels(id, inverse);
                }
              })(),
          },
        }
      : {}),
  });
}

/** `markRead` that hands the error back instead of reporting it (bulk actions sum them up). */
async function tryMarkRead(message: MessageDTO): Promise<MessageDTO | ApiError> {
  store.setPending(message.gmailId, true);
  try {
    const { message: updated } = await api.markRead(message.gmailId);
    store.upsert(updated);
    return updated;
  } catch (error) {
    store.setOverride(message.gmailId, null);
    return asApiError(error);
  } finally {
    store.setPending(message.gmailId, false);
  }
}

/** Marks a message read through `POST /api/v1/messages/{id}/read`; true when it succeeded. */
export async function markRead(message: MessageDTO): Promise<boolean> {
  if (message.isRead) {
    return true;
  }
  store.setOverride(message.gmailId, { isRead: true });
  try {
    const { message: updated } = await api.markRead(message.gmailId);
    store.upsert(updated);
    return true;
  } catch (error) {
    store.setOverride(message.gmailId, null);
    reportFailure(asApiError(error), message.gmailId);
    return false;
  }
}

/** Opening an unread message marks it read without waiting (§1, §2). */
export function markReadInBackground(message: MessageDTO): void {
  void markRead(message);
}
