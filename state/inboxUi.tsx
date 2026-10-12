import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { MessageDTO } from '@/services/types';
import { type Chip, chipCounts, chipFromParam, chipKey, customLabelIds, FIXED_CHIPS, inboxQuery } from '@/lib/filters';
import { toggleSelection } from '@/lib/selection';
import { MIN_QUERY } from '@/components/inbox/SearchBar';
import { INBOX_PATH, navigate, setInboxQuery, threadIdOf } from '@/lib/router';
import { useStore } from '@/state/store';

/**
 * Inbox UI state shared by the sidebar and the inbox view: the active label (DESIGN_SPEC.md §4),
 * the search text (§5), whether the sidebar is open on a phone, and the selected messages (§1
 * Selection). Kept for the session, so a thread round trip restores the label and search. The
 * selection is cleared whenever the label or the search changes.
 */
interface InboxUi {
  chip: Chip;
  /** Selects a label. From a thread or a search, returns to the inbox list on that label. */
  selectChip: (chip: Chip) => void;
  searchText: string;
  searchActive: boolean;
  setSearchText: (value: string) => void;
  exitSearch: () => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  /** Selected `gmailId`s; a list shows only those it holds. */
  selected: ReadonlySet<string>;
  /** Toggles one message; `range` extends from the last one toggled, in the list's `order`. */
  toggleSelected: (id: string, options?: { range?: boolean; order?: readonly string[] }) => void;
  setSelected: (ids: Iterable<string>) => void;
  clearSelection: () => void;
}

const Context = createContext<InboxUi | null>(null);

export function InboxUiProvider({ children }: { children: ReactNode }) {
  // The label and search start from the address (`/inbox?label=starred&q=thursday`), so a reload
  // or a shared link opens the same list; they are written back as they change.
  const [chip, setChip] = useState<Chip>(() => (typeof window === 'undefined' ? (FIXED_CHIPS[0] ?? { kind: 'all' }) : chipFromParam(new URLSearchParams(window.location.search).get('label'))));
  const [searchText, setSearch] = useState(() => (typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('q') ?? '')));
  const [searchActive, setSearchActive] = useState(() => searchText.trim().length >= MIN_QUERY);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelectedState] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    setInboxQuery(inboxQuery(chip, searchActive ? searchText : ''));
  }, [chip, searchActive, searchText]);

  const clearSelection = useCallback(() => {
    anchor.current = null;
    setSelectedState((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);
  const toggleSelected = useCallback((id: string, options: { range?: boolean; order?: readonly string[] } = {}) => {
    // Read the anchor now: the updater runs later, after it has moved to this message.
    const from = anchor.current;
    setSelectedState((prev) => toggleSelection(prev, id, { ...options, anchor: from }));
    anchor.current = id;
  }, []);
  const setSelected = useCallback((ids: Iterable<string>) => {
    anchor.current = null;
    setSelectedState(new Set(ids));
  }, []);

  const setSearchText = useCallback(
    (value: string) => {
      setSearch(value);
      // Each new query is a new list: the selection starts over.
      clearSelection();
      if (value.trim().length >= MIN_QUERY) {
        setSearchActive(true);
      } else if (value.trim() === '') {
        setSearchActive(false);
      }
    },
    [clearSelection],
  );

  const exitSearch = useCallback(() => {
    setSearch('');
    setSearchActive(false);
    clearSelection();
  }, [clearSelection]);

  const selectChip = useCallback(
    (next: Chip) => {
      const inThread = threadIdOf(window.location.pathname) !== null;
      const leavingSearch = searchActive;
      exitSearch();
      setMenuOpen(false);
      if (inThread) {
        navigate(INBOX_PATH);
      }
      if (chipKey(next) === chipKey(chip) && !inThread && !leavingSearch) {
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Re-selecting the active label scrolls to top.
        return;
      }
      setChip(next);
      clearSelection();
      if (!inThread) {
        window.scrollTo({ top: 0 });
      }
    },
    [chip, searchActive, exitSearch, clearSelection],
  );

  const value = useMemo(
    () => ({
      chip,
      selectChip,
      searchText,
      searchActive,
      setSearchText,
      exitSearch,
      menuOpen,
      setMenuOpen,
      selected,
      toggleSelected,
      setSelected,
      clearSelection,
    }),
    [chip, selectChip, searchText, searchActive, setSearchText, exitSearch, menuOpen, selected, toggleSelected, setSelected, clearSelection],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useInboxUi(): InboxUi {
  const value = useContext(Context);
  if (!value) {
    throw new Error('useInboxUi must be used inside InboxUiProvider');
  }
  return value;
}

/** The loaded inbox messages (from the shared cache), the labels they produce, and per-label counts. */
export function useLoadedMessages(): { loaded: MessageDTO[]; chips: Chip[]; counts: Map<string, number> } {
  const s = useStore();
  const version = s.getVersion();
  const ids = s.inbox.ids;
  const loaded = useMemo(() => ids.map((id) => s.get(id)).filter((m): m is MessageDTO => m !== undefined), [ids, version, s]);
  const chips = useMemo(() => [...FIXED_CHIPS, ...customLabelIds(loaded).map((labelId): Chip => ({ kind: 'label', labelId }))], [loaded]);
  const counts = useMemo(() => chipCounts(loaded, chips), [loaded, chips]);
  return { loaded, chips, counts };
}
