import { useEffect, useMemo, useRef, useState } from 'react';
import { chipKey, chipLabel, matchesChip, shouldFill } from '@/lib/filters';
import { relativeTime } from '@/lib/format';
import { loadDrafts, useDrafts } from '@/state/drafts';
import { useInboxUi, useLoadedMessages } from '@/state/inboxUi';
import { loadInbox, loadMore, useStore } from '@/state/store';
import { DraftsView } from '@/components/drafts';
import { SearchView } from '@/components/search';
import { MessageList } from '@/components/inbox/MessageList';
import { SelectBox } from '@/components/inbox/SelectBox';
import { SelectionBar } from '@/components/inbox/SelectionBar';
import { useListSelection } from '@/components/inbox/useListSelection';
import { MIN_QUERY, SearchBar } from '@/components/inbox/SearchBar';
import { useNearEnd } from '@/components/inbox/useNearEnd';

/**
 * The inbox view (DESIGN_SPEC.md §1): the search bar on top, then the message list for the label
 * chosen in the sidebar (§4). A query of 2+ characters swaps the list for search results (§5).
 * The label and search live in `InboxUiProvider`, shared with the sidebar. Drafts is not a filter:
 * it swaps the list for the draft list (DraftsView), and Refresh then re-reads the drafts.
 *
 * `covered` is true while a thread is open: the thread replaces this view, which stays mounted so
 * its paging survives the round trip.
 */
export function InboxView({ covered }: { covered: boolean }) {
  const s = useStore();
  const { inbox } = s;
  const { chip, searchText, searchActive, setSearchText, exitSearch, menuOpen, setMenuOpen } = useInboxUi();
  const [fillPages, setFillPages] = useState(0);
  const fillAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (inbox.state === 'idle') {
      void loadInbox();
    }
  }, [inbox.state]);

  const drafts = useDrafts();
  const showingDrafts = chip.kind === 'drafts';
  const { loaded } = useLoadedMessages();
  const visible = useMemo(() => loaded.filter((m) => matchesChip(m, chip)), [loaded, chip]);
  const selection = useListSelection(visible);
  const filling = !showingDrafts && inbox.state === 'ready' && shouldFill(visible.length, fillPages, inbox.nextCursor) && !inbox.moreError;
  const lookFurther = !showingDrafts && inbox.state === 'ready' && fillPages >= 5 && visible.length < 25 && inbox.nextCursor !== null;

  // Switching labels cancels a fill in progress and starts counting again (§4).
  const key = chipKey(chip);
  useEffect(() => {
    fillAbort.current?.abort();
    setFillPages(0);
  }, [key]);

  // A label with too few loaded matches keeps paging (§4 User actions).
  useEffect(() => {
    if (!filling || inbox.loadingMore) {
      return;
    }
    const controller = new AbortController();
    fillAbort.current = controller;
    void loadMore(controller.signal).then(() => !controller.signal.aborted && setFillPages((n) => n + 1));
  }, [filling, inbox.loadingMore]);

  const sentinel = useNearEnd(() => {
    if (!filling && !lookFurther && !inbox.moreError) {
      void loadMore();
    }
  }, inbox.state === 'ready' && inbox.nextCursor !== null && !searchActive && !showingDrafts);

  const query = searchText.trim();

  return (
    <div className={covered ? 'list-pane covered' : 'list-pane'}>
      <SearchBar
        value={searchText}
        searching={searchActive}
        refreshing={showingDrafts ? drafts.refreshing : inbox.refreshing}
        refreshDisabled={
          showingDrafts ? drafts.refreshing || drafts.state === 'loading' : inbox.refreshing || inbox.state === 'loading'
        }
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen(true)}
        onChange={setSearchText}
        onCancel={exitSearch}
        onRefresh={() => void (showingDrafts ? loadDrafts({ refresh: true }) : loadInbox({ refresh: true }))}
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
                {inbox.state === 'ready' &&
                  (inbox.lastSyncedAt ? `Synced ${relativeTime(inbox.lastSyncedAt)}` : 'Syncing your mailbox…')}
              </p>
            </div>
          )}
          <MessageList
            inbox={inbox}
            loadedCount={loaded.length}
            visible={visible}
            selection={{ order: selection.order, selecting: selection.selecting }}
            chip={chip}
            pending={s.pending}
            filling={filling}
            lookFurther={lookFurther}
            sentinel={sentinel}
            onRetry={() => void loadInbox()}
            onRefresh={() => void loadInbox({ refresh: true })}
            onLoadMore={() => void loadMore()}
            onLookFurther={() => setFillPages(0)}
          />
        </>
      )}
    </div>
  );
}
