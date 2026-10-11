import { Glyph } from '../ui';

export const MIN_QUERY = 2;
export const MAX_QUERY = 200;

/**
 * The inbox header: product name, the search field and refresh (DESIGN_SPEC.md §1, §5).
 * Search is active once the trimmed text reaches 2 characters; Cancel or Escape ends it.
 */
export function SearchBar({
  value,
  searching,
  refreshing,
  refreshDisabled,
  onChange,
  onCancel,
  onRefresh,
}: {
  value: string;
  searching: boolean;
  refreshing: boolean;
  refreshDisabled: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">VibeMail</div>
      <label className="search">
        <Glyph name="search" />
        <span className="sr-only">Search mail</span>
        <input
          type="search"
          placeholder="Search synced mail"
          value={value}
          maxLength={MAX_QUERY}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        />
        {searching && (
          <button type="button" className="text-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </label>
      {!searching && (
        <button type="button" className="icon-btn" aria-label="Refresh" disabled={refreshDisabled} onClick={onRefresh}>
          {refreshing ? <span className="spinner" /> : <Glyph name="refresh" />}
        </button>
      )}
    </header>
  );
}
