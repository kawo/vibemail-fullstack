import { useSyncExternalStore } from 'react';
import { type ApiError, api, isAbort } from '@/app/services';
import type { DraftDTO } from '@/app/services/types';
import { appendDrafts, removeDraft, upsertDraft } from '@/app/lib/drafts';
import { asApiError, store, type LoadState } from '@/state/store';

/**
 * The user's Gmail drafts (CONTRACT.md §4.13, DESIGN_SPEC.md §4 Drafts). Drafts live only in Gmail,
 * so this is a list read on request: once when the app starts (for the sidebar count), when Drafts
 * is opened, and on Refresh there; never on a timer. The compose drawer keeps it current as it
 * saves, discards and sends, so the count follows without another read.
 */
export interface DraftsState {
  drafts: DraftDTO[];
  nextCursor: string | null;
  state: LoadState;
  error: ApiError | null;
  loadingMore: boolean;
  moreError: ApiError | null;
  refreshing: boolean;
  /** When the list was last read from Gmail. */
  readAt: string | null;
}

let current: DraftsState = {
  drafts: [],
  nextCursor: null,
  state: 'idle',
  error: null,
  loadingMore: false,
  moreError: null,
  refreshing: false,
  readAt: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<DraftsState>): void {
  current = { ...current, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useDrafts(): DraftsState {
  return useSyncExternalStore(subscribe, () => current);
}

export function draftsState(): DraftsState {
  return current;
}

/** First page, or a refresh that keeps the current list until the new one arrives. */
export async function loadDrafts(options: { refresh?: boolean } = {}): Promise<void> {
  if (current.state === 'loading' || current.refreshing) {
    return;
  }
  const refresh = options.refresh === true && current.state === 'ready';
  set(refresh ? { refreshing: true } : { state: 'loading', error: null });
  try {
    const page = await api.listDrafts();
    set({
      drafts: page.drafts,
      nextCursor: page.nextCursor,
      state: 'ready',
      error: null,
      moreError: null,
      refreshing: false,
      readAt: new Date().toISOString(),
    });
  } catch (error) {
    const apiError = asApiError(error);
    set(refresh ? { refreshing: false } : { state: 'error', error: apiError, refreshing: false });
    if (refresh) {
      store.toast('Couldn’t refresh your drafts');
    }
  }
}

/** Next page. A stale cursor (`VALIDATION_FAILED`) reloads from the start. */
export async function loadMoreDrafts(signal?: AbortSignal): Promise<void> {
  if (!current.nextCursor || current.loadingMore) {
    return;
  }
  set({ loadingMore: true, moreError: null });
  try {
    const page = await api.listDrafts(current.nextCursor, 25, signal);
    set({ drafts: appendDrafts(current.drafts, page.drafts), nextCursor: page.nextCursor, loadingMore: false });
  } catch (error) {
    set({ loadingMore: false });
    if (isAbort(error)) {
      return;
    }
    const apiError = asApiError(error);
    if (apiError.code === 'VALIDATION_FAILED') {
      set({ state: 'idle' });
      await loadDrafts();
      return;
    }
    set({ moreError: apiError });
  }
}

/** A draft the drawer just saved: listed at the top. */
export function draftSaved(draft: DraftDTO): void {
  set({ drafts: upsertDraft(current.drafts, draft) });
}

/** A draft the drawer discarded, sent, or found deleted elsewhere. */
export function draftGone(draftId: string): void {
  set({ drafts: removeDraft(current.drafts, draftId) });
}
