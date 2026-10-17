import { useEffect, useMemo } from 'react';
import type { MessageDTO } from '@/app/services/types';
import { chipKey, chipLabel } from '@/app/lib/filters';
import { relativeTime } from '@/app/lib/format';
import { loadDrafts, useDrafts } from '@/state/drafts';
import { useInboxUi } from '@/state/inboxUi';
import { loadList, loadMoreOf, useStore } from '@/state/store';
import { DraftsView } from '@/app/components/drafts';
import { SearchView } from '@/app/components/search';
import { MessageList } from '@/app/components/inbox/MessageList';
import { SelectBox } from '@/app/components/inbox/SelectBox';
import { SelectionBar } from '@/app/components/inbox/SelectionBar';
import { useListSelection } from '@/app/components/inbox/useListSelection';
import { MIN_QUERY, SearchBar } from '@/app/components/inbox/SearchBar';
import { useNearEnd } from '@/app/components/inbox/useNearEnd';

/**
 * The inbox view (DESIGN_SPEC.md §1): the search bar on top, then the message list for the chip,
 * Drafts or custom label chosen in the sidebar (§4). A query of 2+ characters swaps the list for search results (§5).
 * The label and search live in `InboxUiProvider`, shared with the sidebar. Drafts is not a filter:
 * it swaps the list for the draft list (DraftsView), and Refresh then re-reads the drafts.
 *
 * `covered` is true while a thread is open: the thread replaces this view, which stays mounted so
 * its paging survives the round trip.
 */
export function InboxView({ covered }: { covered: boolean }) {
  const s = useStore();
  const { chip, searchText, searchActive, setSearchText, exitSearch, menuOpen, setMenuOpen } = useInboxUi();
  const drafts = useDrafts();
  const showingDrafts = chip.kind === 'drafts';
  const list = s.list(chip);

  // Each label has its own server-filtered list (§4). Choosing one shows what it already holds
  // and refreshes it; a label not loaded yet loads its first page.
  const key = chipKey(chip);
  useEffect(() => {
    if (chip.kind === 'drafts') {
      return;
    }
    // A quiet refresh: only the Refresh button or pull to refresh reports a failure.
    void loadList(chip);
    // `chip` is identified by its key: a new object for the same label must not reload it.
  }, [key]);

  const version = s.getVersion();
  const visible = useMemo(
    () => list.ids.map((id) => s.get(id)).filter((m): m is MessageDTO => m !== undefined),
    [list.ids, version, s],
  );
  const selection = useListSelection(visible);

  const sentinel = useNearEnd(() => {
    if (!list.moreError) {
      void loadMoreOf(chip);
    }
  }, list.state === 'ready' && list.nextCursor !== null && !searchActive && !showingDrafts);

  const query = searchText.trim();

  return (
    <div className={covered ? 'list-pane covered' : 'list-pane'}>
      <SearchBar
        value={searchText}
        searching={searchActive}
        covered={covered}
        refreshing={showingDrafts ? drafts.refreshing : list.refreshing}
        refreshDisabled={
          showingDrafts ? drafts.refreshing || drafts.state === 'loading' : list.refreshing || list.state === 'loading'
        }
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen(true)}
        onChange={setSearchText}
        onCancel={exitSearch}
        onRefresh={() => void (showingDrafts ? loadDrafts({ refresh: true }) : loadList(chip, { refresh: true }))}
      />

      {searchActive && query.length >= MIN_QUERY ? (
        <SearchView query={query} />
      ) : showingDrafts ? (
        <DraftsView />
      ) : (
        <>
          {selection.selecting ? (
            <SelectionBar
              selected={selection.selectedListed}
              listed={visible.length}
              onSelectAll={selection.selectAll}
              onClear={selection.clearSelection}
            />
          ) : (
            <div className="status-line">
              {visible.length > 0 && <SelectBox state="none" label="Select all" onToggle={() => selection.selectAll(true)} />}
              <h1 className="list-title">{chipLabel(chip)}</h1>
              <p className="synced" aria-live="polite">
                {list.state === 'ready' &&
                  (list.lastSyncedAt ? `Synced ${relativeTime(list.lastSyncedAt)}` : 'Syncing your mailbox…')}
              </p>
            </div>
          )}
          <MessageList
            list={list}
            loadedCount={s.all().length}
            visible={visible}
            selection={{ order: selection.order, selecting: selection.selecting }}
            chip={chip}
            pending={s.pending}
            sentinel={sentinel}
            onRetry={() => void loadList(chip)}
            onRefresh={() => void loadList(chip, { refresh: true })}
            onLoadMore={() => void loadMoreOf(chip)}
          />
        </>
      )}
    </div>
  );
}
