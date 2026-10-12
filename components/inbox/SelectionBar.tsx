import { useEffect } from 'react';
import type { MessageDTO } from '@/services/types';
import { type BulkKind, bulkTargets, keepsSelection, readToggle, selectAllState } from '@/lib/selection';
import { bulk } from '@/state/actions';
import { type IconName, Icon } from '@/components/icons';
import { Glyph } from '@/components/ui';
import { SelectBox } from '@/components/inbox/SelectBox';

/** Where a click keeps the selection: rows, this bar, and what floats over the list. */
const KEEPS_SELECTION = '.row, .selection-bar, .toasts, .menu, .drawer, .scrim, .select-box';

type Action = { kind: BulkKind; label: string; icon: IconName; danger?: boolean; pressed?: boolean };

/** The read toggle, like the thread header's: a ring while marking unread, the accent dot once all are unread. */
const READ_TOGGLE: Record<'read' | 'unread', Action> = {
  unread: { kind: 'unread', label: 'Mark unread', icon: 'ring', pressed: false },
  read: { kind: 'read', label: 'Mark read', icon: 'dot', pressed: true },
};

const MOVES: Action[] = [
  { kind: 'archive', label: 'Archive', icon: 'archive' },
  { kind: 'restore', label: 'Restore', icon: 'inbox' },
  { kind: 'trash', label: 'Trash', icon: 'trash', danger: true },
];

/**
 * Replaces the list header while messages are selected (DESIGN_SPEC.md §1 Selection): the
 * select-all box, "{n} selected", the bulk actions and a close control. It sticks under the search
 * bar while the list scrolls. An action applies to the selected messages it can change. Archive,
 * Trash and Restore then clear the selection; the read toggle keeps it, so clicking it again
 * undoes it (Mark unread, then Mark read). Escape clears it too, and so does a click anywhere
 * outside the rows and this bar (a toast, a menu or the compose drawer don't count).
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
    // A click (not a press, so a scroll that starts elsewhere keeps the selection) outside the
    // rows, the bar and the floating layers clears the selection.
    const onClick = (e: MouseEvent) => {
      // A target no longer in the page was re-rendered by the click itself (the read toggle).
      if (e.target instanceof Element && e.target.isConnected && !e.target.closest(KEEPS_SELECTION)) {
        onClear();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [onClear]);

  const all = selectAllState(selected.length, listed);
  // Restore and Trash each show only when they apply; how many actions show decides when the bar
  // has room for their words (styles.css).
  const shown = [
    READ_TOGGLE[readToggle(selected)],
    ...MOVES.filter(({ kind }) => !((kind === 'restore' || kind === 'trash') && bulkTargets(kind, selected).length === 0)),
  ];
  const run = (kind: BulkKind) => {
    const chosen = [...selected];
    if (!keepsSelection(kind)) {
      onClear();
    }
    void bulk(kind, chosen);
  };

  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected messages" data-actions={shown.length}>
      <SelectBox state={all} label={all === 'all' ? 'Select none' : 'Select all'} onToggle={() => onSelectAll(all !== 'all')} />
      <span className="selection-count" aria-live="polite">
        {selected.length} selected
      </span>
      <div className="selection-actions">
        {shown.map(({ kind, label, icon, danger, pressed }) => {
          const count = bulkTargets(kind, selected).length;
          return (
            <button
              key={pressed === undefined ? kind : 'read-toggle'}
              type="button"
              className={`text-btn bulk-btn${danger ? ' danger' : ''}${pressed !== undefined ? ` read-toggle${pressed ? ' on' : ''}` : ''}`}
              aria-pressed={pressed}
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
