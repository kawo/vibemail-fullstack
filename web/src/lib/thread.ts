import type { MessageDTO } from '../api/types';
import { displayName } from './format';

/**
 * Thread-level rules for the thread view header (DESIGN_SPEC.md §2). Gmail stars and marks
 * unread per message; the header shows and changes the conversation as a whole.
 */

/** One or two letters for the avatar: "Marcus Hale" → "MH", "ci@x.io" → "C". */
export function initials(fromAddress: string): string {
  const name = displayName(fromAddress).replace(/@.*$/, '');
  const words = name.split(/[\s._-]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words.slice(0, 2).map((w) => (w.match(/[\p{L}\p{N}]/u)?.[0] ?? '').toUpperCase());
  return letters.join('') || '?';
}

/** The conversation is starred when any of its messages is. */
export function isThreadStarred(messages: readonly MessageDTO[]): boolean {
  return messages.some((m) => m.isStarred);
}

/** The conversation is unread when any of its messages is. */
export function isThreadUnread(messages: readonly MessageDTO[]): boolean {
  return messages.some((m) => !m.isRead);
}

/**
 * Which messages the header star changes. Starring stars the newest message; unstarring removes
 * the star from every starred message, so the conversation reads as unstarred afterwards.
 */
export function starTargets(messages: readonly MessageDTO[]): { star: boolean; targets: MessageDTO[] } {
  if (isThreadStarred(messages)) {
    return { star: false, targets: messages.filter((m) => m.isStarred) };
  }
  const newest = messages[messages.length - 1];
  return { star: true, targets: newest ? [newest] : [] };
}

/**
 * Which messages the header unread toggle changes. Marking unread flags the newest message;
 * marking read clears every unread message.
 */
export function unreadTargets(messages: readonly MessageDTO[]): { unread: boolean; targets: MessageDTO[] } {
  if (isThreadUnread(messages)) {
    return { unread: false, targets: messages.filter((m) => !m.isRead) };
  }
  const newest = messages[messages.length - 1];
  return { unread: true, targets: newest ? [newest] : [] };
}

/** The heading: the oldest message's subject (§2), or "(no subject)". */
export function threadSubject(messages: readonly MessageDTO[]): string {
  return messages[0]?.subject ?? '(no subject)';
}

/** A full timestamp for an expanded card's tooltip and screen readers. */
export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * The conversation's last header action is Restore instead of Move to trash when it was opened
 * from the Trash label, or when every message in it is in the trash (DESIGN_SPEC.md §2).
 */
export function offersRestore(messages: readonly MessageDTO[], fromTrash: boolean): boolean {
  return fromTrash || (messages.length > 0 && messages.every((m) => m.status === 'trash'));
}

/** What each conversation action changes: archive the inbox ones, trash the rest, restore the trashed. */
export function moveTargets(kind: 'archive' | 'trash' | 'restore', messages: readonly MessageDTO[]): MessageDTO[] {
  switch (kind) {
    case 'archive':
      return messages.filter((m) => m.status === 'inbox');
    case 'trash':
      return messages.filter((m) => m.status !== 'trash');
    case 'restore':
      return messages.filter((m) => m.status === 'trash');
  }
}
