import { useSyncExternalStore } from 'react';
import { ApiError, api, isAbort } from '@/services';
import type { MessageDTO } from '@/services/types';

/**
 * One client-side cache of `MessageDTO`s keyed by `gmailId`, shared by every view
 * (DESIGN_SPEC.md shared rules). Any response that returns a message replaces the cached entry,
 * so `labelIds`, `status`, `isRead` and `isStarred` always come from the server.
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface InboxState {
  /** Server order: `internalDate` descending. */
  ids: string[];
  nextCursor: string | null;
  lastSyncedAt: string | null;
  state: LoadState;
  error: ApiError | null;
  loadingMore: boolean;
  moreError: ApiError | null;
  refreshing: boolean;
}

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
  inbox: InboxState = {
    ids: [],
    nextCursor: null,
    lastSyncedAt: null,
    state: 'idle',
    error: null,
    loadingMore: false,
    moreError: null,
    refreshing: false,
  };
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

  upsert(message: MessageDTO): void {
    this.messages.set(message.gmailId, message);
    this.overrides.delete(message.gmailId);
    this.changed();
  }

  upsertMany(messages: readonly MessageDTO[]): void {
    for (const message of messages) {
      this.messages.set(message.gmailId, message);
    }
    this.changed();
  }

  remove(gmailId: string): void {
    this.messages.delete(gmailId);
    this.overrides.delete(gmailId);
    this.inbox = { ...this.inbox, ids: this.inbox.ids.filter((id) => id !== gmailId) };
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

  /** Inserts a message (e.g. one just sent) into the inbox list at its date position. */
  addToInbox(message: MessageDTO): void {
    this.messages.set(message.gmailId, message);
    if (!this.inbox.ids.includes(message.gmailId)) {
      const ids = [...this.inbox.ids];
      const at = ids.findIndex((id) => {
        const other = this.messages.get(id);
        return other !== undefined && other.internalDate < message.internalDate;
      });
      ids.splice(at === -1 ? ids.length : at, 0, message.gmailId);
      this.inbox = { ...this.inbox, ids };
    }
    this.changed();
  }

  setInbox(patch: Partial<InboxState>): void {
    this.inbox = { ...this.inbox, ...patch };
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
    this.inbox = { ids: [], nextCursor: null, lastSyncedAt: null, state: 'idle', error: null, loadingMore: false, moreError: null, refreshing: false };
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

/** First page, or a refresh (`GET /api/v1/messages` with no cursor). Never calls Gmail. */
export async function loadInbox(options: { refresh?: boolean } = {}): Promise<void> {
  store.setInbox(options.refresh ? { refreshing: true } : { state: 'loading', error: null });
  try {
    const page = await api.listMessages();
    store.upsertMany(page.messages);
    store.setInbox({
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
    store.setInbox(
      options.refresh && store.inbox.state === 'ready'
        ? { refreshing: false }
        : { state: 'error', error: apiError, refreshing: false },
    );
    if (options.refresh) {
      store.toast('Couldn’t refresh your mail');
    }
  }
}

/** Next page with `nextCursor`. A stale cursor (`VALIDATION_FAILED`) silently reloads from the start. */
export async function loadMore(signal?: AbortSignal): Promise<void> {
  const { nextCursor, loadingMore } = store.inbox;
  if (!nextCursor || loadingMore) {
    return;
  }
  store.setInbox({ loadingMore: true, moreError: null });
  try {
    const page = await api.listMessages(nextCursor, 25, signal);
    store.upsertMany(page.messages);
    const known = new Set(store.inbox.ids);
    store.setInbox({
      ids: [...store.inbox.ids, ...page.messages.map((m) => m.gmailId).filter((id) => !known.has(id))],
      nextCursor: page.nextCursor,
      lastSyncedAt: page.lastSyncedAt,
      loadingMore: false,
    });
  } catch (error) {
    if (isAbort(error)) {
      store.setInbox({ loadingMore: false });
      return;
    }
    const apiError = asApiError(error);
    store.setInbox({ loadingMore: false });
    if (apiError.code === 'VALIDATION_FAILED') {
      await loadInbox();
      return;
    }
    store.setInbox({ moreError: apiError });
  }
}

export { asApiError };
