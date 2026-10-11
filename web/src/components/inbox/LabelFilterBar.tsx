import { Fragment } from 'react';
import { type Chip, chipKey, chipLabel } from '../../lib/filters';
import { Glyph } from '../ui';

/**
 * The label filter bar (DESIGN_SPEC.md §1, §4): the four fixed chips All, Starred, Archive and
 * Trash always come first, then one chip per custom `Label_…` ID. Exactly one chip is active.
 */
export function LabelFilterBar({ chips, active, onSelect }: { chips: readonly Chip[]; active: Chip; onSelect: (chip: Chip) => void }) {
  return (
    <nav className="filters" aria-label="Label filter">
      {chips.map((chip, i) => (
        <Fragment key={chipKey(chip)}>
          {/* A rule between the fixed chips and the custom label chips. */}
          {chip.kind === 'label' && chips[i - 1]?.kind !== 'label' && <span className="sep" aria-hidden="true" />}
          <button type="button" className="chip" aria-pressed={chipKey(chip) === chipKey(active)} onClick={() => onSelect(chip)}>
            {chip.kind === 'starred' && <Glyph name="star" />}
            {chipLabel(chip)}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
