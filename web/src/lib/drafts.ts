import type { DraftDTO } from '../api/types';
import { splitQuote } from './compose';
import { displayName } from './format';

/**
 * Pure helpers for the Drafts list (DESIGN_SPEC.md §4 Drafts): the list is Gmail's order, newest
 * first, and the compose drawer keeps it current as it saves, discards and sends.
 */

/** A saved draft moves to the top; an unknown one is added there. */
export function upsertDraft(list: readonly DraftDTO[], draft: DraftDTO): DraftDTO[] {
  return [draft, ...list.filter((d) => d.draftId !== draft.draftId)];
}

export function removeDraft(list: readonly DraftDTO[], draftId: string): DraftDTO[] {
  return list.filter((d) => d.draftId !== draftId);
}

/** Appends a further page, skipping drafts already listed (one saved meanwhile moved to the top). */
export function appendDrafts(list: readonly DraftDTO[], page: readonly DraftDTO[]): DraftDTO[] {
  const known = new Set(list.map((d) => d.draftId));
  return [...list, ...page.filter((d) => !known.has(d.draftId))];
}

/**
 * Gmail gives every draft a `threadId`, so it alone can't say the draft is a reply. A draft opened
 * from the list counts as a reply when it is the device's saved snapshot of a reply, or when its
 * thread holds a message VibeMail has stored; otherwise it opens as a new message.
 */
export function replyThreadId(
  draft: DraftDTO,
  snapshot: { draftId: string; requestedThreadId?: string } | null,
  hasStoredThread: (threadId: string) => boolean,
): string | undefined {
  if (snapshot && snapshot.draftId === draft.draftId) {
    return snapshot.requestedThreadId;
  }
  return hasStoredThread(draft.threadId) ? draft.threadId : undefined;
}

/** The row's first line: the recipients, or a placeholder for a draft with none yet. */
export function draftRecipients(draft: DraftDTO): string {
  return draft.to.length > 0 ? draft.to.map(displayName).join(', ') : '(no recipients)';
}

/** The row's snippet: the body's first lines, flattened, without the quoted reply. */
export function draftSnippet(draft: DraftDTO): string {
  return splitQuote(draft.body).text.replace(/\s+/g, ' ').trim().slice(0, 160);
}
