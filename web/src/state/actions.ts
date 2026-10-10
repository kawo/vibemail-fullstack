import { ApiError, api } from '../api/client';
import type { MessageDTO, UpdateLabelsRequest } from '../api/types';
import { asApiError, store } from './store';

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
  store.setPending(gmailId, true);
  try {
    const { message } = await api.updateLabels(gmailId, change);
    store.upsert(message);
    return message;
  } catch (error) {
    store.setOverride(gmailId, null);
    reportFailure(asApiError(error), gmailId);
    return null;
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

/** Opening an unread message marks it read without waiting (§1, §2). */
export function markReadInBackground(message: MessageDTO): void {
  if (message.isRead) {
    return;
  }
  store.setOverride(message.gmailId, { isRead: true });
  api
    .markRead(message.gmailId)
    .then(({ message: updated }) => store.upsert(updated))
    .catch((error: unknown) => {
      store.setOverride(message.gmailId, null);
      reportFailure(asApiError(error), message.gmailId);
    });
}
