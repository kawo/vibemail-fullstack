import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MessageDTO } from '../api/types';
import { type Chip, FIXED_CHIPS, chipKey, customLabelIds } from '../lib/filters';
import { MIN_QUERY } from '../components/inbox/SearchBar';
import { navigate, threadIdOf } from '../router';
import { useStore } from './store';

/**
 * Inbox UI state shared by the sidebar and the inbox view: the active label (DESIGN_SPEC.md §4),
 * the search text (§5), and whether the sidebar is open on a phone. Kept for the session, so a
 * thread round trip restores the label and search.
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
}

const Context = createContext<InboxUi | null>(null);

export function InboxUiProvider({ children }: { children: ReactNode }) {
  const [chip, setChip] = useState<Chip>(FIXED_CHIPS[0] ?? { kind: 'all' });
  const [searchText, setSearch] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const setSearchText = useCallback((value: string) => {
    setSearch(value);
    if (value.trim().length >= MIN_QUERY) {
      setSearchActive(true);
    } else if (value.trim() === '') {
      setSearchActive(false);
    }
  }, []);

  const exitSearch = useCallback(() => {
    setSearch('');
    setSearchActive(false);
  }, []);

  const selectChip = useCallback(
    (next: Chip) => {
      const inThread = threadIdOf(window.location.pathname) !== null;
      const leavingSearch = searchActive;
      exitSearch();
      setMenuOpen(false);
      if (inThread) {
        navigate('/');
      }
      if (chipKey(next) === chipKey(chip) && !inThread && !leavingSearch) {
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Re-selecting the active label scrolls to top.
        return;
      }
      setChip(next);
      if (!inThread) {
        window.scrollTo({ top: 0 });
      }
    },
    [chip, searchActive, exitSearch],
  );

  const value = useMemo(
    () => ({ chip, selectChip, searchText, searchActive, setSearchText, exitSearch, menuOpen, setMenuOpen }),
    [chip, selectChip, searchText, searchActive, setSearchText, exitSearch, menuOpen],
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

/** The loaded inbox messages (from the shared cache) and the labels they produce. */
export function useLoadedMessages(): { loaded: MessageDTO[]; chips: Chip[] } {
  const s = useStore();
  const version = s.getVersion();
  const ids = s.inbox.ids;
  const loaded = useMemo(() => ids.map((id) => s.get(id)).filter((m): m is MessageDTO => m !== undefined), [ids, version, s]);
  const chips = useMemo(() => [...FIXED_CHIPS, ...customLabelIds(loaded).map((labelId): Chip => ({ kind: 'label', labelId }))], [loaded]);
  return { loaded, chips };
}
