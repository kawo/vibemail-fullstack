import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListMessagesResponse } from '@/app/services/types';
import { message } from '@/app/lib/__tests__/fixtures';

const services = vi.hoisted(() => ({ listMessages: vi.fn() }));
vi.mock('@/app/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/services')>();
  return { ...actual, api: { ...actual.api, listMessages: services.listMessages } };
});

import type { Chip } from '@/app/lib/filters';
import { loadList, loadMoreOf, store } from '@/state/store';

const ALL: Chip = { kind: 'all' };

/** A response the test resolves when it chooses, to order concurrent requests. */
function deferred() {
  let resolve: (value: ListMessagesResponse) => void = () => undefined;
  const promise = new Promise<ListMessagesResponse>((r) => (resolve = r));
  return { promise, resolve };
}
const page = (ids: string[], nextCursor: string | null): ListMessagesResponse => ({
  messages: ids.map((gmailId, i) => message({ gmailId, internalDate: `2026-10-${String(20 - i).padStart(2, '0')}T10:00:00.000Z` })),
  nextCursor,
  lastSyncedAt: null,
});

beforeEach(() => {
  vi.stubGlobal('window', { setTimeout: () => 0 });
  store.reset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('one list per label: concurrent loads (DESIGN_SPEC.md §4)', () => {
  it('drops a page loaded with a cursor that a refresh has since replaced', async () => {
    services.listMessages.mockResolvedValueOnce(page(['a', 'b'], 'old'));
    await loadList(ALL);

    const more = deferred();
    const refresh = deferred();
    services.listMessages.mockReturnValueOnce(more.promise).mockReturnValueOnce(refresh.promise);
    const paging = loadMoreOf(ALL); // Scrolled to the end: asks with the old cursor…
    const refreshing = loadList(ALL); // …then the label is chosen again, which refreshes it.

    refresh.resolve(page(['new', 'a'], 'fresh'));
    await refreshing;
    more.resolve(page(['c', 'd'], 'older'));
    await paging;

    const list = store.list(ALL);
    expect(list.ids).toEqual(['new', 'a']);
    expect(list.nextCursor).toBe('fresh');
    expect(list.loadingMore).toBe(false);
  });

  it('does not page while a refresh is replacing the cursor', async () => {
    services.listMessages.mockResolvedValueOnce(page(['a', 'b'], 'old'));
    await loadList(ALL);
    const refresh = deferred();
    services.listMessages.mockReturnValueOnce(refresh.promise);
    const refreshing = loadList(ALL);
    await loadMoreOf(ALL);
    expect(services.listMessages).toHaveBeenCalledTimes(2);
    refresh.resolve(page(['a', 'b'], 'fresh'));
    await refreshing;
  });

  it('keeps the newest of two loads of the same label when they answer out of order', async () => {
    const first = deferred();
    const second = deferred();
    services.listMessages.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = loadList(ALL);
    const b = loadList(ALL);
    second.resolve(page(['newer'], null));
    await b;
    first.resolve(page(['stale'], 'x'));
    await a;
    expect(store.list(ALL).ids).toEqual(['newer']);
    expect(store.list(ALL).nextCursor).toBeNull();
  });
});
