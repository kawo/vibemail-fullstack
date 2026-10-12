import type { MessageDTO } from '@/services/types';
import { useCompose } from '@/components/compose/ComposeContext';
import { displayName, formatSize } from '@/lib/format';
import { MessageRow } from '@/components/MessageRow';
import { toggleStar } from '@/state/actions';
import { HtmlBody } from '@/components/thread/HtmlBody';
import { Glyph } from '@/components/ui';

/**
 * One message in a conversation (DESIGN_SPEC.md §2), as a glass card.
 *
 * Its header line is the shared MessageRow (variant "thread"): collapsed, avatar, sender,
 * snippet, time and a chevron. Expanded, recipients follow below it; then the body
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

  return (
    <article className={`glass card${expanded ? ' expanded' : ''}${sent ? ' sent' : ''}`}>
      <MessageRow variant="thread" message={message} expanded={expanded} onToggle={onToggle} />
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
