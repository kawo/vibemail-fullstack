import { useEffect, useRef, useState } from 'react';
import { SPLIT, useMediaQuery } from '../../lib/layout';
import { Icon } from '../icons';
import { Glyph } from '../ui';

/**
 * The thread view's sticky header: back on the left; on the right the read/unread toggle, the
 * conversation star and a menu with Archive and Move to trash (DESIGN_SPEC.md §2). The controls
 * on the right appear once the thread has loaded; back works at once.
 */
export function ThreadHeader({
  controls,
  onBack,
}: {
  controls: null | {
    unread: boolean;
    starred: boolean;
    busy: boolean;
    onToggleUnread: () => void;
    onToggleStar: () => void;
    onArchive: () => void;
    onTrash: () => void;
  };
  onBack: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Beside the list the thread is closed, not left: an x instead of a back arrow.
  const split = useMediaQuery(SPLIT);
  const menu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menu.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  return (
    <div className="thread-head">
      <button type="button" className="icon-btn back" aria-label={split ? 'Close conversation' : 'Back to inbox'} onClick={onBack}>
        <Glyph name={split ? 'close' : 'back'} />
      </button>
      <span className="spacer" />
      {controls && (
        <>
          <button
            type="button"
            className={`text-btn read-toggle${controls.unread ? ' on' : ''}`}
            aria-pressed={controls.unread}
            title={controls.unread ? 'Mark as read' : 'Mark as unread'}
            disabled={controls.busy}
            onClick={controls.onToggleUnread}
          >
            <Glyph name={controls.unread ? 'dot' : 'ring'} />
            Unread
          </button>
          <button
            type="button"
            className={`icon-btn star ${controls.starred ? 'on' : 'off'}`}
            aria-label={controls.starred ? 'Unstar conversation' : 'Star conversation'}
            aria-pressed={controls.starred}
            disabled={controls.busy}
            onClick={controls.onToggleStar}
          >
            <Glyph name={controls.starred ? 'star' : 'unstar'} />
          </button>
          <div className="menu-anchor" ref={menu}>
            <button
              type="button"
              className="icon-btn"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              disabled={controls.busy}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {controls.busy ? <span className="spinner" /> : <Glyph name="more" />}
            </button>
            {menuOpen && (
              <div className="glass-raised menu" role="menu">
                <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), controls.onArchive())}>
                  <Icon name="archive" /> Archive conversation
                </button>
                <div className="rule" role="separator" />
                <button type="button" role="menuitem" className="danger" onClick={() => (setMenuOpen(false), controls.onTrash())}>
                  <Icon name="trash" /> Move conversation to trash
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
