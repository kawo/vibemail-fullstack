import { useEffect } from 'react';
import type { MessageDTO } from '../../api/types';
import { type BulkKind, bulkTargets, selectAllState } from '../../lib/selection';
import { bulk } from '../../state/actions';
import { type IconName, Icon } from '../icons';
import { Glyph } from '../ui';
import { SelectBox } from './SelectBox';

const ACTIONS: { kind: BulkKind; label: string; icon: IconName; danger?: boolean }[] = [
  { kind: 'unread', label: 'Mark unread', icon: 'dot' },
  { kind: 'archive', label: 'Archive', icon: 'archive' },
  { kind: 'restore', label: 'Restore', icon: 'inbox' },
  { kind: 'trash', label: 'Trash', icon: 'trash', danger: true },
];

/**
 * Replaces the list header while messages are selected (DESIGN_SPEC.md §1 Selection): the
 * select-all box, "{n} selected", the bulk actions and a close control. It sticks under the search
 * bar while the list scrolls. An action applies to the selected messages it can change, then the
 * selection clears. Escape clears it too.
 */
export function SelectionBar({
  selected,
  listed,
  onSelectAll,
  onClear,
}: {
  /** The selected messages that are listed. */
  selected: readonly MessageDTO[];
  /** How many messages are listed. */
  listed: number;
  onSelectAll: (all: boolean) => void;
  onClear: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The compose drawer handles its own Escape.
      if (e.key === 'Escape' && !document.querySelector('.drawer')) {
        onClear();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClear]);

  const all = selectAllState(selected.length, listed);
  const run = (kind: BulkKind) => {
    const chosen = [...selected];
    onClear();
    void bulk(kind, chosen);
  };

  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected messages">
      <SelectBox state={all} label={all === 'all' ? 'Select none' : 'Select all'} onToggle={() => onSelectAll(all !== 'all')} />
      <span className="selection-count" aria-live="polite">
        {selected.length} selected
      </span>
      <div className="selection-actions">
        {ACTIONS.map(({ kind, label, icon, danger }) => {
          const count = bulkTargets(kind, selected).length;
          // Restore appears only when something selected is in the trash; Trash only when something isn't.
          if ((kind === 'restore' || kind === 'trash') && count === 0) {
            return null;
          }
          return (
            <button
              key={kind}
              type="button"
              className={`text-btn bulk-btn${danger ? ' danger' : ''}`}
              disabled={count === 0}
              title={label}
              aria-label={label}
              onClick={() => run(kind)}
            >
              <Icon name={icon} />
              <span className="bulk-label">{label}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="icon-btn" aria-label="Clear selection" title="Clear selection" onClick={onClear}>
        <Glyph name="close" />
      </button>
    </div>
  );
}
