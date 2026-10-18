import type { MessageDTO } from '@/app/services/types';
import { displayName } from '@/app/lib/format';

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

/**
 * Which body an expanded card shows (DESIGN_SPEC.md §2): `bodyPlain` first, the sandboxed
 * `bodyHtml` only when there is no plain text, otherwise the snippet. Blank text counts as none,
 * so a whitespace-only part never leaves the card empty.
 */
export function bodyKind(message: Pick<MessageDTO, 'bodyPlain' | 'bodyHtml'>): 'plain' | 'html' | 'snippet' {
  if (message.bodyPlain?.trim()) {
    return 'plain';
  }
  return message.bodyHtml?.trim() ? 'html' : 'snippet';
}

/** The format a reader picks in the header's Plain | HTML switch. */
export type BodyFormat = 'plain' | 'html';

/** The HTML version can be picked only when there is some. */
export function hasHtmlBody(message: Pick<MessageDTO, 'bodyHtml'>): boolean {
  return Boolean(message.bodyHtml?.trim());
}

/**
 * What an expanded card renders for the picked format. Unpicked, the `bodyKind` default applies.
 * Plain shows `bodyPlain`, else the snippet; HTML falls back to plain when there is none.
 */
export function bodyView(message: Pick<MessageDTO, 'bodyPlain' | 'bodyHtml'>, format: BodyFormat | undefined): 'plain' | 'html' | 'snippet' {
  if (format === undefined) {
    return bodyKind(message);
  }
  if (format === 'html' && hasHtmlBody(message)) {
    return 'html';
  }
  return message.bodyPlain?.trim() ? 'plain' : 'snippet';
}

/**
 * The message the header's format switch acts on: the most recently expanded card that is still
 * open (`expanded` keeps expansion order), or null when none is.
 */
export function currentMessageId(ids: readonly string[], expanded: ReadonlySet<string>): string | null {
  const open = [...expanded].filter((id) => ids.includes(id));
  return open[open.length - 1] ?? null;
}

/**
 * The conversation in Gmail's web app. Gmail accepts the API's thread ID in the `#all/` fragment;
 * `authuser` opens the signed-in account when the browser holds several Google accounts.
 */
export function gmailThreadUrl(threadId: string, email: string | null): string {
  const account = email ? `?authuser=${encodeURIComponent(email)}` : '';
  return `https://mail.google.com/mail/${account}#all/${threadId}`;
}
