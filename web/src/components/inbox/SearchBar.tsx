import { Glyph } from '../ui';

export const MIN_QUERY = 2;
export const MAX_QUERY = 200;

/**
 * The inbox header: product name, the search field and refresh (DESIGN_SPEC.md §1, §5).
 * Search is active once the trimmed text reaches 2 characters, and the field glows in the accent.
 * The inline clear button (or Escape) empties the field and ends the search.
 */
export function SearchBar({
  value,
  searching,
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
  refreshing: boolean;
  refreshDisabled: boolean;
  /** Phones: the sidebar is a panel this button opens. Hidden where the sidebar is always shown. */
  menuOpen: boolean;
  onMenu: () => void;
  onChange: (value: string) => void;
  onCancel: () => void;
  onRefresh: () => void;
}) {
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
          type="search"
          placeholder="Search synced mail"
          value={value}
          maxLength={MAX_QUERY}
          aria-describedby={searching ? undefined : 'search-hint'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        {value !== '' && (
          // Clearing ends the search and restores the inbox, chip and scroll (§5).
          <button type="button" className="icon-btn clear-btn" aria-label="Clear search" onClick={onCancel}>
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
