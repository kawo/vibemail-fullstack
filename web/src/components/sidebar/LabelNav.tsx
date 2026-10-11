import { type Chip, chipKey, chipLabel } from '../../lib/filters';
import { Glyph } from '../ui';

/**
 * The label filter as a vertical list (DESIGN_SPEC.md §4): the four fixed labels, always present
 * and in order, then one entry per custom `Label_…` ID among the loaded messages, alphabetically.
 * The active label is marked with `aria-current`; while a search runs, none is (results span every
 * status), and picking one ends the search.
 */
export function LabelNav({
  chips,
  active,
  searching,
  onSelect,
}: {
  chips: readonly Chip[];
  active: Chip;
  searching: boolean;
  onSelect: (chip: Chip) => void;
}) {
  const fixed = chips.filter((c) => c.kind !== 'label');
  const custom = chips.filter((c) => c.kind === 'label');
  const item = (chip: Chip) => {
    const current = !searching && chipKey(chip) === chipKey(active);
    return (
      <li key={chipKey(chip)}>
        <button type="button" className="nav-item" aria-current={current ? 'page' : undefined} onClick={() => onSelect(chip)}>
          <span className="nav-glyph" aria-hidden="true">
            {chip.kind === 'starred' ? <Glyph name="star" /> : chip.kind === 'label' ? '#' : '·'}
          </span>
          <span className="nav-label">{chipLabel(chip)}</span>
        </button>
      </li>
    );
  };
  return (
    <nav className="label-nav" aria-label="Labels">
      <ul>{fixed.map(item)}</ul>
      <h2 className="nav-heading">Labels</h2>
      {custom.length > 0 ? <ul>{custom.map(item)}</ul> : <p className="nav-empty">No labels on synced mail.</p>}
    </nav>
  );
}
