import { useEffect, useMemo, useRef, useState } from 'react';
import type { MessageDTO } from '../../api/types';
import { type Chip, FIXED_CHIPS, chipKey, customLabelIds, matchesChip, shouldFill } from '../../lib/filters';
import { relativeTime } from '../../lib/format';
import { loadInbox, loadMore, useStore } from '../../state/store';
import { SearchView } from '../search';
import { LabelFilterBar } from './LabelFilterBar';
import { MessageList } from './MessageList';
import { MIN_QUERY, SearchBar } from './SearchBar';
import { useNearEnd } from './useNearEnd';

/**
 * The inbox view (DESIGN_SPEC.md §1): search bar on top, label filter bar below it (§4), then
 * the message list. A query of 2+ characters swaps the filter bar and list for search results (§5).
 * The Compose button is app-level (`ComposeButton`), so it also floats over the thread view.
 *
 * `covered` is true while a thread is open: below 1024px the thread replaces this view, which
 * stays mounted so its chip and scroll position survive the round trip.
 */
export function InboxView({ covered }: { covered: boolean }) {
  const s = useStore();
  const { inbox } = s;
  const [chip, setChip] = useState<Chip>(FIXED_CHIPS[0] ?? { kind: 'all' });
  const [fillPages, setFillPages] = useState(0);
  const fillAbort = useRef<AbortController | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchActive, setSearchActive] = useState(false);

  useEffect(() => {
    if (inbox.state === 'idle') {
      void loadInbox();
    }
  }, [inbox.state]);

  // `s` is a stable singleton: re-derive whenever the store version changes.
  const version = s.getVersion();
  const loaded = useMemo(
    () => inbox.ids.map((id) => s.get(id)).filter((m): m is MessageDTO => m !== undefined),
    [inbox.ids, version, s],
  );
  const chips = useMemo(() => [...FIXED_CHIPS, ...customLabelIds(loaded).map((labelId): Chip => ({ kind: 'label', labelId }))], [loaded]);
  const visible = useMemo(() => loaded.filter((m) => matchesChip(m, chip)), [loaded, chip]);
  const filling = inbox.state === 'ready' && shouldFill(visible.length, fillPages, inbox.nextCursor) && !inbox.moreError;
  const lookFurther = inbox.state === 'ready' && fillPages >= 5 && visible.length < 25 && inbox.nextCursor !== null;

  // A chip with too few loaded matches keeps paging (§4 User actions). Switching chips cancels it.
  useEffect(() => {
    if (!filling || inbox.loadingMore) {
      return;
    }
    const controller = new AbortController();
    fillAbort.current = controller;
    void loadMore(controller.signal).then(() => !controller.signal.aborted && setFillPages((n) => n + 1));
  }, [filling, inbox.loadingMore]);

  const selectChip = (next: Chip) => {
    if (chipKey(next) === chipKey(chip)) {
      window.scrollTo({ top: 0, behavior: 'smooth' }); // Re-tapping the active chip scrolls to top.
      return;
    }
    fillAbort.current?.abort();
    setFillPages(0);
    setChip(next);
  };

  const sentinel = useNearEnd(() => {
    if (!filling && !lookFurther && !inbox.moreError) {
      void loadMore();
    }
  }, inbox.state === 'ready' && inbox.nextCursor !== null && !searchActive);

  const query = searchText.trim();
  const changeSearch = (value: string) => {
    setSearchText(value);
    if (value.trim().length >= MIN_QUERY) {
      setSearchActive(true);
    } else if (value.trim() === '') {
      setSearchActive(false);
    }
  };
  const exitSearch = () => {
    setSearchText('');
    setSearchActive(false);
  };

  return (
    <div className={covered ? 'list-pane covered' : 'list-pane'}>
      <SearchBar
        value={searchText}
        searching={searchActive}
        refreshing={inbox.refreshing}
        refreshDisabled={inbox.refreshing || inbox.state === 'loading'}
        onChange={changeSearch}
        onCancel={exitSearch}
        onRefresh={() => void loadInbox({ refresh: true })}
      />

      {searchActive && query.length >= MIN_QUERY ? (
        <SearchView query={query} />
      ) : (
        <>
          <div className="status-line">
            <p className="synced" aria-live="polite">
              {inbox.state === 'ready' &&
                (inbox.lastSyncedAt ? `Synced ${relativeTime(inbox.lastSyncedAt)}` : 'Syncing your mailbox…')}
            </p>
          </div>
          <LabelFilterBar chips={chips} active={chip} onSelect={selectChip} />
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
