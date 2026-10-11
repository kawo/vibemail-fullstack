import { type Chip, chipKey, chipLabel, countNoun, countText, showsCount } from '../../lib/filters';
import { labelMark } from '../../lib/sidebarWidth';
import { Icon } from '../icons';
import { Glyph } from '../ui';

/**
 * The label filter as a vertical list (DESIGN_SPEC.md §4): the four fixed labels, always present
 * and in order, then one entry per custom `Label_…` ID among the loaded messages, alphabetically.
 * The active label is marked with `aria-current`; while a search runs, none is (results span every
 * status), and picking one ends the search.
 *
 * All shows how many loaded messages are new (unread); Drafts, how many drafts are listed (`25+`
 * while more pages are unread); every other label, how many loaded messages it matches.
 * A zero shows nothing. Collapsed, the
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
  const fixed = chips.filter((c) => c.kind !== 'label');
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
            ) : chip.kind === 'drafts' ? (
              <Icon name="draft" />
            ) : chip.kind === 'archive' ? (
              <Icon name="archive" />
            ) : chip.kind === 'trash' ? (
              <Icon name="trash" />
            ) : collapsed && chip.kind === 'label' ? (
              labelMark(chip.labelId)
            ) : (
              '#'
            )}
          </span>
          <span className="nav-label">{chipLabel(chip)}</span>
          {counted && (
            <span className={chip.kind === 'all' ? 'nav-count new' : 'nav-count'}>
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
