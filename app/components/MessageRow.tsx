import { useRef, useState } from 'react';
import type { MessageDTO } from '@/app/services/types';
import { addressBesideName, displayName, formatSize, highlight, relativeTime } from '@/app/lib/format';
import { fullDate } from '@/app/lib/thread';
import { Avatar } from '@/app/components/thread/Avatar';
import { markReadInBackground, markUnread, move, toggleStar } from '@/state/actions';
import { navigate, threadIdOf, usePath } from '@/app/lib/router';
import { useInboxUi } from '@/state/inboxUi';
import { Icon } from '@/app/components/icons';
import { Glyph } from '@/app/components/ui';
import { SelectBox } from '@/app/components/inbox/SelectBox';

const SWIPE_ARCHIVE_PX = 90;
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 8;

function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlight(text, terms).map((segment, i) => (segment.hit ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>))}
    </>
  );
}

/**
 * THE message row: one component for the inbox list, search results and the thread view
 * (DESIGN_SPEC.md §1, §2, §5). Every field shown is a `MessageDTO` field; `status` is only read
 * (for badges and the Restore action).
 *
 *   variant="list"    an inbox row: checkbox, star, sender, time, subject — snippet, menu, swipe
 *   variant="search"  the same row with the query terms highlighted and a status badge
 *   variant="thread"  a message's header line in a conversation: avatar, sender (address),
 *                     snippet, badge, time and chevron; a click expands or collapses it
 */
export type MessageRowProps =
  | {
      variant?: 'list';
      message: MessageDTO;
      pending: boolean;
      selection?: RowSelection;
    }
  | {
      variant: 'search';
      message: MessageDTO;
      pending: boolean;
      terms: readonly string[];
      selection?: RowSelection;
    }
  | {
      variant: 'thread';
      message: MessageDTO;
      expanded: boolean;
      onToggle: () => void;
    };

/** The list's order (for Shift ranges), and whether anything in it is selected. */
export interface RowSelection {
  order: readonly string[];
  selecting: boolean;
}

export function MessageRow(props: MessageRowProps) {
  if (props.variant === 'thread') {
    return <ThreadLine message={props.message} expanded={props.expanded} onToggle={props.onToggle} />;
  }
  if (props.variant === 'search') {
    return <ListLine message={props.message} pending={props.pending} terms={props.terms} showStatus {...(props.selection ? { selection: props.selection } : {})} />;
  }
  return <ListLine message={props.message} pending={props.pending} {...(props.selection ? { selection: props.selection } : {})} />;
}

/**
 * The list and search line. With `selection`, the row has a checkbox on its leading edge (§1 Selection): Shift extends from
 * the last one toggled, Ctrl/⌘-click and Space toggle, and a long press selects on touch screens.
 * While anything is selected, a click or Enter toggles the row instead of opening it, and swipe
 * is off.
 */
function ListLine({
  message,
  pending,
  terms = [],
  showStatus = false,
  selection,
}: {
  message: MessageDTO;
  pending: boolean;
  terms?: readonly string[];
  showStatus?: boolean;
  selection?: RowSelection;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const press = useRef<number | null>(null);
  const pressed = useRef(false);
  const { selected: selectedIds, toggleSelected } = useInboxUi();
  const checked = selection !== undefined && selectedIds.has(message.gmailId);
  const selecting = selection?.selecting ?? false;
  const toggle = (range: boolean) => selection && toggleSelected(message.gmailId, { range, order: selection.order });
  const cancelPress = () => {
    if (press.current !== null) {
      window.clearTimeout(press.current);
      press.current = null;
    }
  };

  const open = () => {
    markReadInBackground(message);
    navigate(`/thread/${encodeURIComponent(message.threadId)}`);
  };
  const inTrash = message.status === 'trash';
  // On desktop the open thread sits beside the list: mark its row.
  const selected = threadIdOf(usePath()) === message.threadId;

  return (
    <article
      data-message-row={showStatus ? 'search' : 'list'}
      className={`row${message.isRead ? '' : ' unread'}${selected ? ' selected' : ''}${checked ? ' checked' : ''}${pending ? ' pending' : ''}`}
      aria-current={selected ? 'true' : undefined}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onClick={(e) => {
        if (pressed.current) {
          pressed.current = false; // The long press already selected it.
          return;
        }
        if (menuOpen) {
          return;
        }
        if (selection && (selecting || e.shiftKey || e.ctrlKey || e.metaKey)) {
          toggle(e.shiftKey);
          return;
        }
        open();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) {
          return;
        }
        if (e.key === 'Enter') {
          if (selection && selecting) {
            toggle(e.shiftKey);
          } else {
            open();
          }
        } else if (e.key === ' ' && selection) {
          e.preventDefault();
          toggle(e.shiftKey);
        }
      }}
      tabIndex={0}
      aria-label={`${displayName(message.fromAddress)}: ${message.subject ?? '(no subject)'}`}
      onContextMenu={(e) => {
        // A long press selects; the browser's own long-press menu would cover it.
        if (pressed.current || press.current !== null) {
          e.preventDefault();
        }
      }}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        pressed.current = false;
        if (selection && !pending) {
          press.current = window.setTimeout(() => {
            press.current = null;
            pressed.current = true;
            setDx(0);
            toggle(false);
          }, LONG_PRESS_MS);
        }
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        if (!start.current || !touch || pending) {
          return;
        }
        const moveX = touch.clientX - start.current.x;
        const moveY = touch.clientY - start.current.y;
        if (Math.hypot(moveX, moveY) > LONG_PRESS_SLOP_PX) {
          cancelPress();
        }
        if (!selecting && !pressed.current && Math.abs(moveX) > Math.abs(moveY)) {
          setDx(Math.min(0, moveX));
        }
      }}
      onTouchEnd={() => {
        cancelPress();
        if (!selecting && dx <= -SWIPE_ARCHIVE_PX && !inTrash && message.status !== 'archived') {
          void move(message, 'archive');
        }
        setDx(0);
        start.current = null;
      }}
      onTouchCancel={() => {
        cancelPress();
        setDx(0);
      }}
    >
      {selection && (
        <SelectBox
          className="row-select"
          state={checked ? 'all' : 'none'}
          label={`Select message from ${displayName(message.fromAddress)}`}
          onToggle={toggle}
        />
      )}
      <button
        type="button"
        className={`icon-btn star ${message.isStarred ? 'on' : 'off'}`}
        aria-label={message.isStarred ? 'Unstar' : 'Star'}
        aria-pressed={message.isStarred}
        onClick={(e) => {
          e.stopPropagation();
          void toggleStar(message);
        }}
      >
        <Glyph name={message.isStarred ? 'star' : 'unstar'} />
      </button>
      <div className="from">
        <Highlighted text={displayName(message.fromAddress)} terms={terms} />
      </div>
      <div className="meta">
        {showStatus && message.status !== 'inbox' && <span className={`badge ${message.status}`}>{message.status}</span>}
        {message.attachments.length > 0 && (
          <span className="attach-mark" title={message.attachments.map((a) => `${a.filename} (${formatSize(a.size)})`).join(', ')}>
            <Glyph name="clip" />
            <span className="sr-only">Has attachments</span>
          </span>
        )}
        <time dateTime={message.internalDate}>{relativeTime(message.internalDate)}</time>
        <button
          type="button"
          className="icon-btn more"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <Glyph name="more" />
        </button>
      </div>
      <div className="line">
        <span className="subject">
          <Highlighted text={message.subject ?? '(no subject)'} terms={terms} />
        </span>
        <span className="dash" aria-hidden="true">
          {' — '}
        </span>
        <span className="snippet">
          <Highlighted text={message.snippet} terms={terms} />
        </span>
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
              <Icon name="archive" /> Archive
            </button>
          )}
          {inTrash ? (
            <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), void move(message, 'restore'))}>
              Restore
            </button>
          ) : (
            <>
              <div className="rule" role="separator" />
              <button type="button" role="menuitem" className="danger" onClick={() => (setMenuOpen(false), void move(message, 'trash'))}>
                <Icon name="trash" /> Move to trash
              </button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * A message's line in a conversation: collapsed, avatar, sender with the address in brackets,
 * snippet, badge, time and a chevron; expanded, the larger avatar and no snippet. The rest of the
 * expanded message (recipients, body, attachments, Reply) is MessageCard's.
 */
function ThreadLine({ message, expanded, onToggle }: { message: MessageDTO; expanded: boolean; onToggle: () => void }) {
  const sent = message.status === 'sent';
  const badge = message.status === 'trash' || message.status === 'spam' || message.status === 'archived';
  const name = sent ? 'You' : displayName(message.fromAddress);
  // The sender's address in brackets beside the name, unless the name already is the address.
  const mail = addressBesideName(message.fromAddress, name);
  return (
    <div
      data-message-row="thread"
      className="card-head"
      onClick={onToggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle())}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${name}${mail ? ` (${mail})` : ''}, ${fullDate(message.internalDate)}${message.isRead ? '' : ', unread'}`}
    >
      <Avatar fromAddress={message.fromAddress} size={expanded ? 'md' : 'sm'} self={sent} />
      <span className={`who${message.isRead ? '' : ' unread'}`} title={mail ?? undefined}>
        {name}
        {mail && <span className="who-mail"> ({mail})</span>}
      </span>
      {expanded ? <span className="fill" /> : <span className="collapsed-snippet">{message.snippet}</span>}
      <span className="when">
        {badge && <span className={`badge ${message.status}`}>{message.status}</span>}
        <time dateTime={message.internalDate} title={fullDate(message.internalDate)}>
          {relativeTime(message.internalDate)}
        </time>
      </span>
      <Glyph name="chevron" className={`chevron${expanded ? ' open' : ''}`} />
    </div>
  );
}
