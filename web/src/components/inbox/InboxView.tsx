import { useEffect, useMemo, useRef, useState } from 'react';
import { chipKey, chipLabel, matchesChip, shouldFill } from '../../lib/filters';
import { relativeTime } from '../../lib/format';
import { useInboxUi, useLoadedMessages } from '../../state/inboxUi';
import { loadInbox, loadMore, useStore } from '../../state/store';
import { SearchView } from '../search';
import { MessageList } from './MessageList';
import { MIN_QUERY, SearchBar } from './SearchBar';
import { useNearEnd } from './useNearEnd';

/**
 * The inbox view (DESIGN_SPEC.md §1): the search bar on top, then the message list for the label
 * chosen in the sidebar (§4). A query of 2+ characters swaps the list for search results (§5).
 * The label and search live in `InboxUiProvider`, shared with the sidebar.
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

  const { loaded } = useLoadedMessages();
  const visible = useMemo(() => loaded.filter((m) => matchesChip(m, chip)), [loaded, chip]);
  const filling = inbox.state === 'ready' && shouldFill(visible.length, fillPages, inbox.nextCursor) && !inbox.moreError;
  const lookFurther = inbox.state === 'ready' && fillPages >= 5 && visible.length < 25 && inbox.nextCursor !== null;

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
  }, inbox.state === 'ready' && inbox.nextCursor !== null && !searchActive);

  const query = searchText.trim();

  return (
    <div className={covered ? 'list-pane covered' : 'list-pane'}>
      <SearchBar
        value={searchText}
        searching={searchActive}
        refreshing={inbox.refreshing}
        refreshDisabled={inbox.refreshing || inbox.state === 'loading'}
        menuOpen={menuOpen}
        onMenu={() => setMenuOpen(true)}
        onChange={setSearchText}
        onCancel={exitSearch}
        onRefresh={() => void loadInbox({ refresh: true })}
      />

      {searchActive && query.length >= MIN_QUERY ? (
        <SearchView query={query} />
      ) : (
        <>
          <div className="status-line">
            <h1 className="list-title">{chipLabel(chip)}</h1>
            <p className="synced" aria-live="polite">
              {inbox.state === 'ready' &&
                (inbox.lastSyncedAt ? `Synced ${relativeTime(inbox.lastSyncedAt)}` : 'Syncing your mailbox…')}
            </p>
          </div>
          <MessageList
            inbox={inbox}
            loadedCount={loaded.length}
            visible={visible}
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
