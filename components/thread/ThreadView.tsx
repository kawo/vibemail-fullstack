import { useEffect, useState } from 'react';
import { type ApiError, api, isAbort } from '@/services';
import type { MessageDTO } from '@/services/types';
import { isThreadStarred, isThreadUnread, moveTargets, offersRestore, starTargets, threadSubject, unreadTargets } from '@/lib/thread';
import { INBOX_PATH, navigate } from '@/lib/router';
import { changeLabels, markRead, markReadInBackground, markUnread, toggleStar } from '@/state/actions';
import { useInboxUi } from '@/state/inboxUi';
import { asApiError, useStore } from '@/state/store';
import { Glyph, Panel } from '@/components/ui';
import { MessageCard } from '@/components/thread/MessageCard';
import { ThreadHeader } from '@/components/thread/ThreadHeader';
import { ThreadSkeleton } from '@/components/thread/ThreadSkeleton';

/**
 * The thread view (DESIGN_SPEC.md §2): `GET /api/v1/threads/{threadId}`, rendered oldest first in
 * the response's order. The newest message opens expanded (and is marked read); earlier ones are
 * collapsed. Every message is read from the shared cache, so stars and read state stay in step
 * with the inbox.
 */
export function ThreadView({ threadId }: { threadId: string }) {
  const s = useStore();
  const [ids, setIds] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { chip, searchActive } = useInboxUi();

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    api
      .getThread(threadId, controller.signal)
      .then((thread) => {
        s.upsertMany(thread.messages);
        setIds(thread.messages.map((m) => m.gmailId)); // Oldest first, as the server orders them.
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
  const newestId = messages[messages.length - 1]?.gmailId;
  // While loading, show what the inbox already knows about this thread.
  const cached = state === 'loading' ? s.inbox.ids.map((id) => s.get(id)).find((m) => m?.threadId === threadId) : undefined;
  const back = () => navigate(INBOX_PATH);

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

  /** Runs one change per message, in order; returns how many succeeded before a failure. */
  const runEach = async (targets: readonly MessageDTO[], run: (m: MessageDTO) => Promise<boolean>) => {
    setBusy(true);
    let changed = 0;
    for (const message of targets) {
      if (!(await run(message))) {
        break;
      }
      changed += 1;
    }
    setBusy(false);
    return changed;
  };

  const toggleUnread = async () => {
    const { unread, targets } = unreadTargets(messages);
    await runEach(targets, async (m) => (unread ? (await markUnread(m)) !== null : markRead(m)));
  };

  const toggleConversationStar = async () => {
    const { targets } = starTargets(messages);
    await runEach(targets, async (m) => (await toggleStar(m)) !== null);
  };

  /** Archive, trash or restore the conversation: one PATCH at a time; a failure stops and reports (§2). */
  const moveAll = async (kind: 'archive' | 'trash' | 'restore') => {
    const targets = moveTargets(kind, messages);
    const change = { archive: { removeLabelIds: ['INBOX'] }, trash: { addLabelIds: ['TRASH'] }, restore: { removeLabelIds: ['TRASH'] } }[kind];
    const changed = await runEach(targets, async (m) => (await changeLabels(m.gmailId, change)) !== null);
    if (changed < targets.length) {
      s.toast(`Changed ${changed} of ${targets.length} messages`);
      return;
    }
    s.toast({ archive: 'Conversation archived', trash: 'Conversation moved to Trash', restore: 'Conversation restored to the inbox' }[kind]);
    back();
  };
  const restoring = offersRestore(messages, chip.kind === 'trash' && !searchActive);

  if (state === 'error') {
    const code = error?.code;
    // UNAUTHENTICATED and GMAIL_NOT_CONNECTED are handled app-wide (sign-in, reconnect panel).
    const handledElsewhere = code === 'GMAIL_NOT_CONNECTED' || code === 'UNAUTHENTICATED';
    const title =
      code === 'VALIDATION_FAILED'
        ? 'This conversation link isn’t valid'
        : code === 'MESSAGE_NOT_FOUND'
          ? 'This conversation isn’t available'
          : 'Couldn’t load this conversation';
    const canRetry = code === 'INTERNAL' || error?.canRetry === true;
    return (
      <div className="thread-pane">
        <ThreadHeader controls={null} onBack={back} />
        {!handledElsewhere && (
          <Panel
            title={title}
            action={
              canRetry ? (
                <button type="button" className="secondary-btn" onClick={() => setAttempt((n) => n + 1)}>
                  Retry
                </button>
              ) : (
                <button type="button" className="secondary-btn" onClick={back}>
                  Back to inbox
                </button>
              )
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="thread-pane">
      <ThreadHeader
        onBack={back}
        controls={
          state === 'ready'
            ? {
                unread: isThreadUnread(messages),
                starred: isThreadStarred(messages),
                busy,
                onToggleUnread: () => void toggleUnread(),
                onToggleStar: () => void toggleConversationStar(),
                canArchive: moveTargets('archive', messages).length > 0,
                onArchive: () => void moveAll('archive'),
                restore: restoring,
                onTrash: () => void moveAll(restoring ? 'restore' : 'trash'),
              }
            : null
        }
      />
      {state === 'loading' ? (
        <ThreadSkeleton cached={cached} />
      ) : (
        <div className="thread-body">
          <h1 className="thread-title">{threadSubject(messages)}</h1>
          {truncated && (
            <div className="banner">
              <Glyph name="missing" /> Earlier messages in this conversation aren’t available in VibeMail
            </div>
          )}
          {messages.map((message) => (
            <MessageCard
              key={message.gmailId}
              message={message}
              expanded={expanded.has(message.gmailId)}
              newest={message.gmailId === newestId}
              onToggle={() => toggle(message)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
