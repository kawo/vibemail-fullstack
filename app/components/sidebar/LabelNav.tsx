import { BAR_CHIPS, type Chip, chipKey, chipLabel, countNoun, countText, showsCount } from '@/app/lib/filters';
import { labelMark } from '@/app/lib/sidebarWidth';
import { Icon } from '@/app/components/icons';
import { Glyph } from '@/app/components/ui';

/**
 * The sidebar's labels as a column of chips, one per line (DESIGN_SPEC.md §1 Label sidebar): All,
 * Starred, Archive, Trash and Drafts, always present and in order, then one chip per custom
 * `Label_…` ID among the loaded messages, alphabetically. The active chip is marked with
 * `aria-current`; while a search runs, none is (results span every status), and picking one ends
 * the search.
 *
 * Every chip shows how many of its loaded messages are new (unread); Drafts, which has no unread
 * state, how many drafts are listed (`25+` while more pages are unread). A zero shows nothing. Collapsed, the
 * count becomes a small badge on the icon and joins the tooltip.
 */
export function LabelNav({
  chips,
  counts,
  openEnded,
  active,
  searching,
  collapsed = false,
  onSelect,
}: {
  chips: readonly Chip[];
  /** Matches per label, keyed by `chipKey`. */
  counts?: ReadonlyMap<string, number>;
  /** Labels whose list has unread pages: the count reads `25+`. */
  openEnded?: ReadonlySet<string>;
  active: Chip;
  searching: boolean;
  /** Icons only: the name moves to a tooltip; it stays in the button's accessible name. */
  collapsed?: boolean;
  onSelect: (chip: Chip) => void;
}) {
  // The four filters, then Drafts.
  const fixed = [...BAR_CHIPS, ...chips.filter((c) => c.kind === 'drafts')];
  const custom = chips.filter((c) => c.kind === 'label');
  const item = (chip: Chip) => {
    const current = !searching && chipKey(chip) === chipKey(active);
    const count = counts?.get(chipKey(chip)) ?? 0;
    const counted = showsCount(count);
    const shown = countText(count, openEnded?.has(chipKey(chip)) ?? false);
    return (
      <li key={chipKey(chip)}>
        <button
          type="button"
          className="nav-item"
          aria-current={current ? 'page' : undefined}
          title={collapsed ? (counted ? `${chipLabel(chip)} · ${shown}` : chipLabel(chip)) : undefined}
          onClick={() => onSelect(chip)}
        >
          <span className="nav-glyph" aria-hidden="true">
            {chip.kind === 'all' ? (
              <Icon name="inbox" />
            ) : chip.kind === 'starred' ? (
              <Glyph name="star" className="star-mark" />
            ) : chip.kind === 'archive' ? (
              <Icon name="archive" />
            ) : chip.kind === 'trash' ? (
              <Icon name="trash" />
            ) : chip.kind === 'drafts' ? (
              <Icon name="draft" />
            ) : collapsed && chip.kind === 'label' ? (
              labelMark(chip.labelId)
            ) : (
              '#'
            )}
          </span>
          <span className="nav-label">{chipLabel(chip)}</span>
          {counted && (
            <span className={chip.kind === 'drafts' ? 'nav-count' : 'nav-count new'}>
              <span className="sr-only">, </span>
              {shown}
              <span className="sr-only">{` ${countNoun(chip, count)}`}</span>
            </span>
          )}
        </button>
      </li>
    );
  };
  return (
    <nav className="label-nav" aria-label="Labels">
      <ul>{fixed.map(item)}</ul>
      <h2 className="nav-heading">{collapsed ? <span className="sr-only">Labels</span> : 'Labels'}</h2>
      {custom.length > 0 ? <ul>{custom.map(item)}</ul> : <p className="nav-empty">No labels on synced mail.</p>}
    </nav>
  );
}
