import { useEffect, useRef, useState } from 'react';
import { SPLIT, matches } from '@/app/lib/breakpoints';
import { INBOX_PATH, navigate } from '@/app/lib/router';
import { isMacPlatform, isSearchShortcut, searchShortcutHint } from '@/app/lib/shortcuts';
import { Glyph } from '@/app/components/ui';

export const MIN_QUERY = 2;
export const MAX_QUERY = 200;

/**
 * The inbox header: product name, the search field and refresh (DESIGN_SPEC.md §1, §5).
 * Search is active once the trimmed text reaches 2 characters, and the field glows in the accent.
 * The inline clear button (or Escape) empties the field and ends the search.
 *
 * ⌘K (Apple devices) or Ctrl+K focuses the field from anywhere but the compose drawer; when a
 * thread covers the list (narrower than the side-by-side layout), it first returns to the inbox.
 * The empty field shows the shortcut for the device.
 */
export function SearchBar({
  value,
  searching,
  covered,
  refreshing,
  refreshDisabled,
  menuOpen,
  onMenu,
  onChange,
  onCancel,
  onRefresh,
}: {
  value: string;
  searching: boolean;
  /** A thread is open; below the side-by-side width it hides this view. */
  covered: boolean;
  refreshing: boolean;
  refreshDisabled: boolean;
  /** Phones: the sidebar is a panel this button opens. Hidden where the sidebar is always shown. */
  menuOpen: boolean;
  onMenu: () => void;
  onChange: (value: string) => void;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  // Known only in the browser; the server render shows no hint.
  const [mac, setMac] = useState<boolean | null>(null);
  useEffect(() => setMac(isMacPlatform(navigator)), []);

  useEffect(() => {
    if (mac === null) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchShortcut(e, mac) || document.querySelector('.drawer')) {
        return;
      }
      e.preventDefault();
      if (covered && !matches(SPLIT)) {
        navigate(INBOX_PATH);
        requestAnimationFrame(() => input.current?.focus());
        return;
      }
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mac, covered]);

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn menu-btn"
        aria-label="Labels and compose"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={onMenu}
      >
        <Glyph name="menu" />
      </button>
      <label className={`search${searching ? ' active' : ''}`}>
        <Glyph name="search" />
        <span className="sr-only">Search mail</span>
        <input
          ref={input}
          type="search"
          placeholder="Search synced mail"
          aria-keyshortcuts={mac === null ? undefined : mac ? 'Meta+K' : 'Control+K'}
          value={value}
          maxLength={MAX_QUERY}
          aria-describedby={searching ? undefined : 'search-hint'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        {value === '' && mac !== null && (
          <kbd className="shortcut-hint" aria-hidden="true">
            {searchShortcutHint(mac)}
          </kbd>
        )}
        {value !== '' && (
          // Clearing ends the search and restores the inbox, chip and scroll (§5).
          <button
            type="button"
            className="icon-btn clear-btn"
            aria-label="Clear search"
            onClick={() => {
              onCancel();
              // The button goes with the text: keep the keyboard in the field rather than the page.
              input.current?.focus();
            }}
          >
            <Glyph name="close" />
          </button>
        )}
      </label>
      {!searching && (
        <button type="button" className="icon-btn" aria-label="Refresh" disabled={refreshDisabled} onClick={onRefresh}>
          {refreshing ? <span className="spinner" /> : <Glyph name="refresh" />}
        </button>
      )}
      <span id="search-hint" className="sr-only">
        Type at least {MIN_QUERY} characters to search.
      </span>
    </header>
  );
}
