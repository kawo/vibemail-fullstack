import { useEffect, useMemo, useRef, useState } from 'react';
import type { MessageDTO } from '../api/types';
import {
  type Chip,
  FIXED_CHIPS,
  chipKey,
  chipLabel,
  customLabelIds,
  emptyStateText,
  matchesChip,
  shouldFill,
} from '../lib/filters';
import { relativeTime } from '../lib/format';
import { loadInbox, loadMore, useStore } from '../state/store';
import { MessageRow } from './MessageRow';
import { SearchResults } from './SearchResults';
import { Icon, Panel, Skeletons } from './ui';

const MIN_QUERY = 2;
const MAX_QUERY = 200;
const PULL_PX = 70;

/** Calls `onVisible` when the sentinel comes within one screen of the viewport. */
function useNearEnd(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) {
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && callback.current(), {
      rootMargin: '0px 0px 100% 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return ref;
}

function FilterBar({ chips, active, onSelect }: { chips: Chip[]; active: Chip; onSelect: (chip: Chip) => void }) {
  return (
    <nav className="filters" aria-label="Label filter">
      {chips.map((chip) => (
        <button
          key={chipKey(chip)}
          type="button"
          className="chip"
          aria-pressed={chipKey(chip) === chipKey(active)}
          onClick={() => onSelect(chip)}
        >
          {chipLabel(chip)}
        </button>
      ))}
    </nav>
  );
}

/** Inbox (DESIGN_SPEC.md §1) with the label filter (§4) and the search entry point (§5). */
export function Inbox({ hidden }: { hidden: boolean }) {
  const s = useStore();
  const { inbox } = s;
  const [chip, setChip] = useState<Chip>(FIXED_CHIPS[0] ?? { kind: 'all' });
  const [fillPages, setFillPages] = useState(0);
  const fillAbort = useRef<AbortController | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);

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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
  const exitSearch = () => {
    setSearchText('');
    setSearchActive(false);
  };

  const emptyChipText = emptyStateText(chip);

  return (
    <div className={hidden ? 'hidden' : undefined}>
      <header className="topbar">
        <div className="brand">
          Vibe<span>Mail</span>
        </div>
        <label className="glass search">
          <Icon name="search" size={18} />
          <span className="sr-only">Search mail</span>
          <input
            type="search"
            placeholder="Search mail"
            value={searchText}
            maxLength={MAX_QUERY}
            onChange={(e) => {
              setSearchText(e.target.value);
              if (e.target.value.trim().length >= MIN_QUERY) {
                setSearchActive(true);
              } else if (e.target.value.trim() === '') {
                setSearchActive(false);
              }
            }}
            onKeyDown={(e) => e.key === 'Escape' && exitSearch()}
          />
          {searchActive && (
            <button type="button" className="text-btn" onClick={exitSearch}>
              Cancel
            </button>
          )}
        </label>
        {!searchActive && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Refresh"
            disabled={inbox.refreshing || inbox.state === 'loading'}
            onClick={() => void loadInbox({ refresh: true })}
          >
            {inbox.refreshing ? <span className="spinner" /> : <Icon name="refresh" />}
          </button>
        )}
      </header>

      {searchActive && query.length >= MIN_QUERY ? (
        <SearchResults query={query} />
      ) : (
        <>
          <p className="synced" aria-live="polite">
            {inbox.state === 'ready' &&
              (inbox.lastSyncedAt ? `Synced ${relativeTime(inbox.lastSyncedAt)}` : 'Syncing your mailbox…')}
          </p>
          <FilterBar chips={chips} active={chip} onSelect={selectChip} />

          <div
            onTouchStart={(e) => {
              pullStart.current = window.scrollY === 0 ? (e.touches[0]?.clientY ?? null) : null;
            }}
            onTouchMove={(e) => {
              const y = e.touches[0]?.clientY;
              if (pullStart.current !== null && y !== undefined) {
                setPull(Math.max(0, Math.min(110, y - pullStart.current)));
              }
            }}
            onTouchEnd={() => {
              if (pull >= PULL_PX && inbox.state === 'ready') {
                void loadInbox({ refresh: true });
              }
              setPull(0);
              pullStart.current = null;
            }}
          >
            <div className="pull" style={{ height: inbox.refreshing ? 44 : pull * 0.5 }} aria-hidden={!inbox.refreshing}>
              {(inbox.refreshing || pull > 0) && <span className="spinner" />}
            </div>

            {inbox.state === 'loading' || inbox.state === 'idle' ? (
              <Skeletons count={8} />
            ) : inbox.state === 'error' && inbox.error?.code !== 'GMAIL_NOT_CONNECTED' ? (
              <Panel
                title="Couldn’t load your mail"
                action={
                  <button type="button" className="primary-btn" onClick={() => void loadInbox()}>
                    Retry
                  </button>
                }
              />
            ) : inbox.state === 'error' ? null : visible.length === 0 && !filling ? (
              emptyChipText ? (
                <Panel title={emptyChipText}>
                  {chip.kind !== 'starred' && <p>Only mail VibeMail has synced appears here.</p>}
                </Panel>
              ) : inbox.lastSyncedAt === null && loaded.length === 0 ? (
                <Panel title="Your mailbox is syncing">
                  <p>New mail will appear here as it arrives.</p>
                </Panel>
              ) : (
                <Panel title="You’re all caught up">
                  {inbox.lastSyncedAt && <p>Synced {relativeTime(inbox.lastSyncedAt)}</p>}
                </Panel>
              )
            ) : (
              <div className="list">
                {visible.map((message) => (
                  <MessageRow key={message.gmailId} message={message} pending={s.pending.has(message.gmailId)} />
                ))}
              </div>
            )}

            {inbox.state === 'ready' && (
              <>
                {(inbox.loadingMore || filling) && (
                  <div className="inline-row">
                    <span className="spinner" />
                    {filling && chip.kind !== 'all' ? 'Looking for more…' : null}
                  </div>
                )}
                {inbox.moreError && !inbox.loadingMore && (
                  <div className="inline-row">
                    Couldn’t load more ·{' '}
                    <button type="button" className="text-btn" onClick={() => void loadMore()}>
                      Retry
                    </button>
                  </div>
                )}
                {lookFurther && !inbox.loadingMore && (
                  <div className="inline-row">
                    <button type="button" className="text-btn" onClick={() => setFillPages(0)}>
                      Look further
                    </button>
                  </div>
                )}
                <div ref={sentinel} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
