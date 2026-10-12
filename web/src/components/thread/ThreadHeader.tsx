import { SPLIT, useMediaQuery } from '../../lib/layout';
import { Icon } from '../icons';
import { Glyph } from '../ui';

/**
 * The thread view's sticky header (DESIGN_SPEC.md §2): back (or close, beside the list) on the
 * left; on the right four icon buttons: the read/unread toggle, the conversation star, Archive and
 * Move to trash. Each keeps its name as its accessible label and tooltip. The controls on the
 * right appear once the thread has loaded; back works at once. While an action runs, a spinner
 * leads them and they are disabled.
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
  // Beside the list the thread is closed, not left: an x instead of a back arrow.
  const split = useMediaQuery(SPLIT);
  const readLabel = controls?.unread ? 'Mark as read' : 'Mark as unread';
  const starLabel = controls?.starred ? 'Unstar conversation' : 'Star conversation';

  return (
    <div className="thread-head">
      <button type="button" className="icon-btn back" aria-label={split ? 'Close conversation' : 'Back to inbox'} onClick={onBack}>
        <Glyph name={split ? 'close' : 'back'} />
      </button>
      <span className="spacer" />
      {controls && (
        <>
          {controls.busy && <span className="spinner" aria-label="Working" />}
          <button
            type="button"
            className={`icon-btn read-toggle${controls.unread ? ' on' : ''}`}
            aria-pressed={controls.unread}
            aria-label={readLabel}
            title={readLabel}
            disabled={controls.busy}
            onClick={controls.onToggleUnread}
          >
            <Glyph name={controls.unread ? 'dot' : 'ring'} />
          </button>
          <button
            type="button"
            className={`icon-btn star ${controls.starred ? 'on' : 'off'}`}
            aria-label={starLabel}
            title={starLabel}
            aria-pressed={controls.starred}
            disabled={controls.busy}
            onClick={controls.onToggleStar}
          >
            <Glyph name={controls.starred ? 'star' : 'unstar'} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Archive conversation"
            title="Archive conversation"
            disabled={controls.busy}
            onClick={controls.onArchive}
          >
            <Icon name="archive" />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Move conversation to trash"
            title="Move conversation to trash"
            disabled={controls.busy}
            onClick={controls.onTrash}
          >
            <Icon name="trash" />
          </button>
        </>
      )}
    </div>
  );
}
