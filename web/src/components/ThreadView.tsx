import { useEffect, useState } from 'react';
import { type ApiError, api, isAbort } from '../api/client';
import type { MessageDTO } from '../api/types';
import { useCompose } from '../compose/ComposeContext';
import { displayName, formatSize, relativeTime } from '../lib/format';
import { changeLabels, markReadInBackground, toggleStar } from '../state/actions';
import { asApiError, useStore } from '../state/store';
import { navigate } from '../router';
import { HtmlBody } from './HtmlBody';
import { Icon, Panel } from './ui';

function MessageCard({
  message,
  expanded,
  onToggle,
}: {
  message: MessageDTO;
  expanded: boolean;
  onToggle: () => void;
}) {
  const compose = useCompose();
  return (
    <article className={`glass card${message.status === 'sent' ? ' sent' : ''}`}>
      <div className="card-head" onClick={onToggle} role="button" tabIndex={0} aria-expanded={expanded} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span className="who">{displayName(message.fromAddress)}</span>
        {(message.status === 'trash' || message.status === 'spam' || message.status === 'archived') && (
          <span className="badge">{message.status}</span>
        )}
        <time className="synced" dateTime={message.internalDate}>
          {relativeTime(message.internalDate)}
        </time>
      </div>
      {!expanded ? (
        <div className="collapsed-snippet">{message.snippet}</div>
      ) : (
        <>
          <div className="addr">
            To {message.toAddress.join(', ') || '—'}
            {message.ccAddresses.length > 0 && <> · Cc {message.ccAddresses.join(', ')}</>}
          </div>
          {message.bodyHtml ? (
            <HtmlBody html={message.bodyHtml} />
          ) : (
            <div className="body-plain">{message.bodyPlain ?? message.snippet}</div>
          )}
          {message.attachments.length > 0 && (
            <div className="attachments" aria-label="Attachments">
              {message.attachments.map((a) => (
                <span key={a.partId} className="attachment" title={a.mimeType}>
                  <Icon name="clip" size={14} /> {a.filename} · {formatSize(a.size)}
                </span>
              ))}
            </div>
          )}
          <div className="card-actions">
            <button type="button" className="text-btn" onClick={() => compose.open({ reply: message })}>
              <Icon name="reply" size={16} /> Reply
            </button>
            <button
              type="button"
              className={`icon-btn star${message.isStarred ? ' on' : ''}`}
              aria-label={message.isStarred ? 'Unstar' : 'Star'}
              aria-pressed={message.isStarred}
              onClick={() => void toggleStar(message)}
            >
              <Icon name="star" size={18} />
            </button>
          </div>
        </>
      )}
    </article>
  );
}

/** Thread view (DESIGN_SPEC.md §2): `GET /api/v1/threads/{threadId}`, oldest first. */
export function ThreadView({ threadId }: { threadId: string }) {
  const s = useStore();
  const [ids, setIds] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    api
      .getThread(threadId, controller.signal)
      .then((thread) => {
        s.upsertMany(thread.messages);
        setIds(thread.messages.map((m) => m.gmailId));
        setTruncated(thread.truncated);
        const newest = thread.messages[thread.messages.length - 1];
        if (newest) {
          setExpanded(new Set([newest.gmailId]));
          markReadInBackground(newest);
        }
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!isAbort(err)) {
          setError(asApiError(err));
          setState('error');
        }
      });
    return () => controller.abort();
  }, [threadId, attempt, s]);

  const messages = ids.map((id) => s.get(id)).filter((m): m is MessageDTO => m !== undefined);
  // While loading, show what the inbox already knows about this thread.
  const cached = state === 'loading' ? s.inbox.ids.map((id) => s.get(id)).find((m) => m?.threadId === threadId) : undefined;
  const subject = (messages[0] ?? cached)?.subject ?? (state === 'ready' ? '(no subject)' : '');

  const toggle = (message: MessageDTO) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(message.gmailId)) {
        next.delete(message.gmailId);
      } else {
        next.add(message.gmailId);
        markReadInBackground(message);
      }
      return next;
    });
  };

  /** Archive or trash the conversation: one PATCH at a time; a failure stops the loop. */
  const moveAll = async (kind: 'archive' | 'trash') => {
    const targets = messages.filter((m) => (kind === 'archive' ? m.status === 'inbox' : m.status !== 'trash'));
    setBusy(true);
    let changed = 0;
    for (const message of targets) {
      const result = await changeLabels(message.gmailId, kind === 'archive' ? { removeLabelIds: ['INBOX'] } : { addLabelIds: ['TRASH'] });
      if (!result) {
        setBusy(false);
        s.toast(`Changed ${changed} of ${targets.length} messages`);
        return;
      }
      changed += 1;
    }
    setBusy(false);
    s.toast(kind === 'archive' ? 'Conversation archived' : 'Conversation moved to Trash');
    navigate('/');
  };

  const back = (
    <button type="button" className="icon-btn" aria-label="Back to inbox" onClick={() => navigate('/')}>
      <Icon name="back" />
    </button>
  );

  if (state === 'error') {
    const code = error?.code;
    if (code === 'GMAIL_NOT_CONNECTED' || code === 'UNAUTHENTICATED') {
      return <div className="thread-head">{back}</div>;
    }
    const title =
      code === 'VALIDATION_FAILED'
        ? 'This conversation link isn’t valid'
        : code === 'MESSAGE_NOT_FOUND'
          ? 'This conversation isn’t available'
          : 'Couldn’t load this conversation';
    return (
      <>
        <div className="thread-head">{back}</div>
        <Panel
          title={title}
          action={
            code === 'INTERNAL' || error?.canRetry ? (
              <button type="button" className="primary-btn" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            ) : (
              <button type="button" className="primary-btn" onClick={() => navigate('/')}>
                Back to inbox
              </button>
            )
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="thread-head">
        {back}
        <h1>{subject || <span className="skeleton" style={{ display: 'block', height: 22, width: '60%' }} />}</h1>
        {state === 'ready' && (
          <>
            <button type="button" className="icon-btn" aria-label="Archive conversation" disabled={busy} onClick={() => void moveAll('archive')}>
              <Icon name="archive" />
            </button>
            <button type="button" className="icon-btn" aria-label="Move conversation to trash" disabled={busy} onClick={() => void moveAll('trash')}>
              <Icon name="trash" />
            </button>
          </>
        )}
      </div>
      {state === 'loading' ? (
        <div className="list">
          {cached && (
            <div className="glass card">
              <div className="collapsed-snippet">{cached.snippet}</div>
            </div>
          )}
          {Array.from({ length: cached ? 2 : 3 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 96 }} />
          ))}
        </div>
      ) : (
        <>
          {truncated && <div className="glass banner">Earlier messages in this conversation aren’t available in VibeMail</div>}
          {messages.map((message) => (
            <MessageCard key={message.gmailId} message={message} expanded={expanded.has(message.gmailId)} onToggle={() => toggle(message)} />
          ))}
        </>
      )}
    </>
  );
}
