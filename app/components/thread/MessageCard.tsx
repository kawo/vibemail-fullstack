import type { MessageDTO } from '@/app/services/types';
import { useCompose } from '@/app/components/compose/ComposeContext';
import { displayName } from '@/app/lib/format';
import { type BodyFormat, bodyView } from '@/app/lib/thread';
import { MessageRow } from '@/app/components/MessageRow';
import { toggleStar } from '@/state/actions';
import { AttachmentList } from '@/app/components/thread/AttachmentList';
import { HtmlBody } from '@/app/components/thread/HtmlBody';
import { Glyph } from '@/app/components/ui';

/**
 * One message in a conversation (DESIGN_SPEC.md §2), as a glass card.
 *
 * Its header line is the shared MessageRow (variant "thread"): collapsed, avatar, sender,
 * snippet, time and a chevron. Expanded, recipients follow below it; then the body
 * (by default `bodyPlain`, else `bodyHtml` sandboxed, else `snippet`; the header's Plain | HTML
 * switch can pick the format, see `bodyView`), attachments, and Reply. The newest
 * card carries the primary Reply; any other expanded card has a quieter one.
 */
export function MessageCard({
  message,
  expanded,
  newest,
  format,
  onToggle,
}: {
  message: MessageDTO;
  expanded: boolean;
  newest: boolean;
  /** The format picked in the header; undefined until the reader picks one. */
  format: BodyFormat | undefined;
  onToggle: () => void;
}) {
  const compose = useCompose();
  const sent = message.status === 'sent';
  const kind = bodyView(message, format);

  return (
    <article className={`glass card${expanded ? ' expanded' : ''}${sent ? ' sent' : ''}`}>
      <MessageRow variant="thread" message={message} expanded={expanded} onToggle={onToggle} />
      {expanded && (
        <div className="card-main">
          <div className="addr">
            to {message.toAddress.map(displayName).join(', ') || '—'}
            {message.ccAddresses.length > 0 && <> · cc {message.ccAddresses.map(displayName).join(', ')}</>}
          </div>
          {kind === 'html' ? (
            <div className="html-body">
              <HtmlBody html={message.bodyHtml ?? ''} />
            </div>
          ) : (
            <div className="body-plain">{kind === 'plain' ? message.bodyPlain : message.snippet}</div>
          )}
          <AttachmentList message={message} />
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
