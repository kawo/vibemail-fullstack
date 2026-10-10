import type { DraftDTO } from '../api/types';

/**
 * The local snapshot of the last successful `DraftDTO` (DESIGN_SPEC.md §3 Draft-restored state).
 * Restore is same-device only: the contract has no endpoint to list or fetch drafts. Storage can
 * be unavailable (private mode, blocked site data), so every access is guarded.
 */

const KEY = 'vibemail.glass.draft';

/**
 * The last `DraftDTO` the server returned, plus the `threadId` the user actually replied into:
 * Gmail gives every draft a thread, so `DraftDTO.threadId` alone can't tell a reply apart.
 */
export type DraftSnapshot = DraftDTO & { requestedThreadId?: string };

export function loadDraftSnapshot(): DraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as Partial<DraftSnapshot>;
    if (typeof value.draftId !== 'string' || !Array.isArray(value.to) || typeof value.updatedAt !== 'string') {
      return null;
    }
    return value as DraftSnapshot;
  } catch {
    return null;
  }
}

export function saveDraftSnapshot(draft: DraftDTO, requestedThreadId?: string): void {
  try {
    const snapshot: DraftSnapshot = { ...draft, ...(requestedThreadId ? { requestedThreadId } : {}) };
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable: the draft still exists in Gmail; only restore is lost.
  }
}

export function clearDraftSnapshot(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Unsent compose content, kept locally when a send or save can't reach Gmail (reconnect, sign-in)
 * so nothing typed is lost. Unlike the draft snapshot, it has no `draftId`.
 */
const UNSENT_KEY = 'vibemail.glass.unsent';

export interface UnsentContent {
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
}

export function loadUnsent(): UnsentContent | null {
  try {
    const raw = window.localStorage.getItem(UNSENT_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<UnsentContent>) : null;
    return value && Array.isArray(value.to) && typeof value.subject === 'string' && typeof value.body === 'string'
      ? (value as UnsentContent)
      : null;
  } catch {
    return null;
  }
}

export function saveUnsent(content: UnsentContent): void {
  try {
    window.localStorage.setItem(UNSENT_KEY, JSON.stringify(content));
  } catch {
    // Storage unavailable.
  }
}

export function clearUnsent(): void {
  try {
    window.localStorage.removeItem(UNSENT_KEY);
  } catch {
    // Nothing to clear.
  }
}
