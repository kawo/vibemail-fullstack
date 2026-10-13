import type { MessageDTO } from '../../api/types';
import { useCompose } from '../../compose/ComposeContext';
import { addressBesideName, displayName, formatSize, relativeTime } from '../../lib/format';
import { fullDate } from '../../lib/thread';
import { toggleStar } from '../../state/actions';
import { HtmlBody } from '../HtmlBody';
import { Glyph } from '../ui';
import { Avatar } from './Avatar';

/**
 * One message in a conversation (DESIGN_SPEC.md §2), as a glass card.
 *
 * Collapsed: one line with avatar, sender, snippet, time and a chevron.
 * Expanded: avatar on the left; sender and time on one line, recipients below; then the body
 * (`bodyHtml` sandboxed, else `bodyPlain`, else `snippet`), attachments, and Reply. The newest
 * card carries the primary Reply; any other expanded card has a quieter one.
 */
export function MessageCard({
  message,
  expanded,
  newest,
  onToggle,
}: {
  message: MessageDTO;
  expanded: boolean;
  newest: boolean;
  onToggle: () => void;
}) {
  const compose = useCompose();
  const sent = message.status === 'sent';
  const badge = message.status === 'trash' || message.status === 'spam' || message.status === 'archived';
  const name = sent ? 'You' : displayName(message.fromAddress);
  // The sender's address in brackets beside the name, unless the name already is the address.
  const mail = addressBesideName(message.fromAddress, name);
  const time = (
    <time dateTime={message.internalDate} title={fullDate(message.internalDate)}>
      {relativeTime(message.internalDate)}
    </time>
  );

  const head = (
    <div
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
        {time}
      </span>
      <Glyph name="chevron" className={`chevron${expanded ? ' open' : ''}`} />
    </div>
  );

  return (
    <article className={`glass card${expanded ? ' expanded' : ''}${sent ? ' sent' : ''}`}>
      {head}
      {expanded && (
        <div className="card-main">
          <div className="addr">
            to {message.toAddress.map(displayName).join(', ') || '—'}
            {message.ccAddresses.length > 0 && <> · cc {message.ccAddresses.map(displayName).join(', ')}</>}
          </div>
          {message.bodyHtml ? (
            <div className="html-body">
              <HtmlBody html={message.bodyHtml} />
            </div>
          ) : (
            <div className="body-plain">{message.bodyPlain ?? message.snippet}</div>
          )}
          {message.attachments.length > 0 && (
            <div className="attachments" aria-label="Attachments">
              {message.attachments.map((a) => (
                <span key={a.partId} className="attachment">
                  <Glyph name="clip" className="sep" /> <b>{a.filename}</b> <span className="sep">·</span> {a.mimeType}{' '}
                  <span className="sep">·</span> {formatSize(a.size)}
                </span>
              ))}
            </div>
          )}
          <div className="card-actions">
            <button type="button" className={newest ? 'primary-btn sm' : 'secondary-btn'} onClick={() => compose.open({ reply: message })}>
              Reply
            </button>
            <button
              type="button"
              className={`icon-btn star ${message.isStarred ? 'on' : 'off'}`}
              aria-label={message.isStarred ? 'Unstar this message' : 'Star this message'}
              aria-pressed={message.isStarred}
              onClick={() => void toggleStar(message)}
            >
              <Glyph name={message.isStarred ? 'star' : 'unstar'} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
