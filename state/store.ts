import { useSyncExternalStore } from 'react';
import { ApiError, api, isAbort } from '@/app/services';
import type { MessageDTO } from '@/app/services/types';
import { type Chip, chipKey, chipParam } from '@/app/lib/filters';
import { type ListState, emptyList, placeInLists } from '@/app/lib/lists';

export type { ListState, LoadState } from '@/app/lib/lists';

/**
 * One client-side cache of `MessageDTO`s keyed by `gmailId`, shared by every view
 * (DESIGN_SPEC.md shared rules), and one server-filtered list per label (CONTRACT.md §4.2
 * `label`, v1.2). Any response that returns a message replaces the cached entry, so `labelIds`,
 * `status`, `isRead` and `isStarred` always come from the server, and the message moves between
 * the loaded lists it now does or doesn't belong to.
 */

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  /** Milliseconds before it disappears. */
  ttl: number;
}

class Store {
  private readonly messages = new Map<string, MessageDTO>();
  /** Optimistic display-only overrides (the star icon), cleared when the server answers. */
  private readonly overrides = new Map<string, Partial<MessageDTO>>();
  /** Messages with a label change in flight: dimmed and not swipeable. */
  readonly pending = new Set<string>();
  /** One list per label, keyed by `chipKey`; `chips` remembers which label each key is. */
  private lists = new Map<string, ListState>();
  private readonly chips = new Map<string, Chip>();
  toasts: Toast[] = [];
  private version = 0;
  private readonly listeners = new Set<() => void>();
  private toastSeq = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  changed(): void {
    this.version += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  get(gmailId: string): MessageDTO | undefined {
    const message = this.messages.get(gmailId);
    const override = this.overrides.get(gmailId);
    return message && override ? { ...message, ...override } : message;
  }

  /** Every cached message, whichever list, search or thread loaded it (for counts and labels). */
  all(): MessageDTO[] {
    return [...this.messages.keys()].map((id) => this.get(id)).filter((m): m is MessageDTO => m !== undefined);
  }

  /** Whether any cached message belongs to `threadId`. */
  hasThread(threadId: string): boolean {
    for (const message of this.messages.values()) {
      if (message.threadId === threadId) {
        return true;
      }
    }
    return false;
  }

  list(chip: Chip): ListState {
    return this.lists.get(chipKey(chip)) ?? emptyList();
  }

  setList(chip: Chip, patch: Partial<ListState>): void {
    const key = chipKey(chip);
    this.chips.set(key, chip);
    this.lists = new Map(this.lists).set(key, { ...this.list(chip), ...patch });
    this.changed();
  }

  /** A message returned by the server: cached, and moved into or out of every loaded list. */
  upsert(message: MessageDTO): void {
    this.messages.set(message.gmailId, message);
    this.overrides.delete(message.gmailId);
    this.lists = placeInLists(this.lists, [...this.chips.values()], message, this.messages);
    this.changed();
  }

  /** A page of messages; the caller sets the list they belong to. */
  upsertMany(messages: readonly MessageDTO[]): void {
    for (const message of messages) {
      this.messages.set(message.gmailId, message);
    }
    this.changed();
  }

  remove(gmailId: string): void {
    this.messages.delete(gmailId);
    this.overrides.delete(gmailId);
    const next = new Map<string, ListState>();
    for (const [key, list] of this.lists) {
      next.set(key, list.ids.includes(gmailId) ? { ...list, ids: list.ids.filter((id) => id !== gmailId) } : list);
    }
    this.lists = next;
    this.changed();
  }

  setOverride(gmailId: string, override: Partial<MessageDTO> | null): void {
    if (override) {
      this.overrides.set(gmailId, override);
    } else {
      this.overrides.delete(gmailId);
    }
    this.changed();
  }

  setPending(gmailId: string, pending: boolean): void {
    if (pending) {
      this.pending.add(gmailId);
    } else {
      this.pending.delete(gmailId);
    }
    this.changed();
  }

  toast(text: string, options: { action?: Toast['action']; ttl?: number } = {}): void {
    this.toastSeq += 1;
    const toast: Toast = { id: this.toastSeq, text, ttl: options.ttl ?? 4000, ...(options.action ? { action: options.action } : {}) };
    this.toasts = [...this.toasts, toast];
    this.changed();
    window.setTimeout(() => this.dismissToast(toast.id), toast.ttl);
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.changed();
  }

  reset(): void {
    this.messages.clear();
    this.overrides.clear();
    this.pending.clear();
    this.lists = new Map();
    this.chips.clear();
    this.changed();
  }
}

export const store = new Store();

/** Re-renders the caller whenever the store changes. */
export function useStore(): Store {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

const asApiError = (error: unknown): ApiError =>
  error instanceof ApiError ? error : new ApiError(0, { code: 'INTERNAL', message: String(error), retryable: false });

/**
 * First page of a label's list, or a refresh (`GET /api/v1/messages?label=…`, no cursor). A list
 * that already has messages keeps showing them while it refreshes. Never calls Gmail.
 */
export async function loadList(chip: Chip, options: { refresh?: boolean } = {}): Promise<void> {
  const shown = store.list(chip).state === 'ready';
  store.setList(chip, shown ? { refreshing: true } : { state: 'loading', error: null });
  try {
    const page = await api.listMessages(chipParam(chip));
    store.upsertMany(page.messages);
    store.setList(chip, {
      ids: page.messages.map((m) => m.gmailId),
      nextCursor: page.nextCursor,
      lastSyncedAt: page.lastSyncedAt,
      state: 'ready',
      error: null,
      moreError: null,
      refreshing: false,
    });
  } catch (error) {
    const apiError = asApiError(error);
    store.setList(chip, shown ? { refreshing: false } : { state: 'error', error: apiError, refreshing: false });
    if (shown && options.refresh) {
      store.toast('Couldn’t refresh your mail');
    }
  }
}

/** Next page of a label's list, with its own cursor and label. A stale cursor (`VALIDATION_FAILED`) silently reloads from the start. */
export async function loadMoreOf(chip: Chip, signal?: AbortSignal): Promise<void> {
  const { nextCursor, loadingMore } = store.list(chip);
  if (!nextCursor || loadingMore) {
    return;
  }
  store.setList(chip, { loadingMore: true, moreError: null });
  try {
    const page = await api.listMessages(chipParam(chip), nextCursor, 25, signal);
    store.upsertMany(page.messages);
    const current = store.list(chip);
    const known = new Set(current.ids);
    store.setList(chip, {
      ids: [...current.ids, ...page.messages.map((m) => m.gmailId).filter((id) => !known.has(id))],
      nextCursor: page.nextCursor,
      lastSyncedAt: page.lastSyncedAt,
      loadingMore: false,
    });
  } catch (error) {
    if (isAbort(error)) {
      store.setList(chip, { loadingMore: false });
      return;
    }
    const apiError = asApiError(error);
    store.setList(chip, { loadingMore: false });
    if (apiError.code === 'VALIDATION_FAILED') {
      await loadList(chip);
      return;
    }
    store.setList(chip, { moreError: apiError });
  }
}

export { asApiError };
