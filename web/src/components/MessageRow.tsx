import { useRef, useState } from 'react';
import type { MessageDTO } from '../api/types';
import { formatSize, displayName, highlight, relativeTime } from '../lib/format';
import { markReadInBackground, markUnread, move, toggleStar } from '../state/actions';
import { navigate } from '../router';
import { Icon } from './ui';

const SWIPE_ARCHIVE_PX = 90;

function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlight(text, terms).map((segment, i) => (segment.hit ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>))}
    </>
  );
}

/**
 * One inbox or search row (DESIGN_SPEC.md §1, §5). Every field shown is a `MessageDTO` field;
 * `status` is only read (for badges and the Restore action).
 */
export function MessageRow({
  message,
  pending,
  terms = [],
  showStatus = false,
}: {
  message: MessageDTO;
  pending: boolean;
  terms?: readonly string[];
  showStatus?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);

  const open = () => {
    markReadInBackground(message);
    navigate(`/thread/${encodeURIComponent(message.threadId)}`);
  };
  const inTrash = message.status === 'trash';

  return (
    <article
      className={`row${message.isRead ? '' : ' unread'}${pending ? ' pending' : ''}`}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onClick={() => !menuOpen && open()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          open();
        }
      }}
      tabIndex={0}
      aria-label={`${displayName(message.fromAddress)}: ${message.subject ?? '(no subject)'}`}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (!start.current || !touch || pending) {
          return;
        }
        const moveX = touch.clientX - start.current.x;
        if (Math.abs(moveX) > Math.abs(touch.clientY - start.current.y)) {
          setDx(Math.min(0, moveX));
        }
      }}
      onTouchEnd={() => {
        if (dx <= -SWIPE_ARCHIVE_PX && !inTrash && message.status !== 'archived') {
          void move(message, 'archive');
        }
        setDx(0);
        start.current = null;
      }}
    >
      <div className="from">
        <Highlighted text={displayName(message.fromAddress)} terms={terms} />
      </div>
      <div className="meta">
        {showStatus && message.status !== 'inbox' && <span className="badge">{message.status}</span>}
        {message.attachments.length > 0 && (
          <span title={message.attachments.map((a) => `${a.filename} (${formatSize(a.size)})`).join(', ')}>
            <Icon name="clip" size={16} />
          </span>
        )}
        <time dateTime={message.internalDate}>{relativeTime(message.internalDate)}</time>
        <button
          type="button"
          className={`icon-btn star${message.isStarred ? ' on' : ''}`}
          aria-label={message.isStarred ? 'Unstar' : 'Star'}
          aria-pressed={message.isStarred}
          onClick={(e) => {
            e.stopPropagation();
            void toggleStar(message);
          }}
        >
          <Icon name="star" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <Icon name="more" size={18} />
        </button>
      </div>
      <div className="subject">
        <Highlighted text={message.subject ?? '(no subject)'} terms={terms} />
      </div>
      <div className="snippet">
        <Highlighted text={message.snippet} terms={terms} />
      </div>
      {menuOpen && (
        <div className="glass-raised menu" role="menu" onClick={(e) => e.stopPropagation()}>
          {message.isRead && (
            <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), void markUnread(message))}>
              Mark unread
            </button>
          )}
          {!inTrash && message.status !== 'archived' && (
            <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), void move(message, 'archive'))}>
              Archive
            </button>
          )}
          {inTrash ? (
            <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), void move(message, 'restore'))}>
              Restore
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), void move(message, 'trash'))}>
              Move to trash
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
