import { type Ref, useRef, useState } from 'react';
import type { MessageDTO } from '@/app/services/types';
import { type Chip, emptyStateText } from '@/app/lib/filters';
import { relativeTime } from '@/app/lib/format';
import type { InboxState } from '@/state/store';
import { Panel, Skeletons } from '@/app/components/ui';
import { MessageRow } from '@/app/components/MessageRow';

const PULL_PX = 70;

/**
 * The inbox list and every state it can be in (DESIGN_SPEC.md §1, §4): first-load skeletons,
 * the load error, the three empty states, the rows, and the paging rows at the end
 * (loading more, "Looking for more…", "Couldn't load more · Retry", "Look further").
 * Pull to refresh re-reads the first page.
 */
export function MessageList({
  inbox,
  loadedCount,
  visible,
  chip,
  pending,
  filling,
  lookFurther,
  sentinel,
  onRetry,
  onRefresh,
  onLoadMore,
  onLookFurther,
  selection,
}: {
  inbox: InboxState;
  loadedCount: number;
  visible: readonly MessageDTO[];
  chip: Chip;
  pending: ReadonlySet<string>;
  filling: boolean;
  lookFurther: boolean;
  sentinel: Ref<HTMLDivElement>;
  onRetry: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  onLookFurther: () => void;
  selection: { order: readonly string[]; selecting: boolean };
}) {
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const emptyChipText = emptyStateText(chip);

  let body;
  if (inbox.state === 'loading' || inbox.state === 'idle') {
    body = <Skeletons count={8} />;
  } else if (inbox.state === 'error') {
    // GMAIL_NOT_CONNECTED is handled by the app-wide reconnect panel.
    body =
      inbox.error?.code === 'GMAIL_NOT_CONNECTED' ? null : (
        <Panel
          title="Couldn’t load your mail"
          action={
            <button type="button" className="secondary-btn" onClick={onRetry}>
              Retry
            </button>
          }
        />
      );
  } else if (visible.length === 0 && !filling) {
    if (emptyChipText) {
      body = (
        <Panel empty title={emptyChipText}>
          {chip.kind !== 'starred' && <p>Only mail VibeMail has synced appears here.</p>}
        </Panel>
      );
    } else if (inbox.lastSyncedAt === null && loadedCount === 0) {
      body = (
        <Panel empty title="Your mailbox is syncing">
          <p>New mail will appear here as it arrives.</p>
        </Panel>
      );
    } else {
      body = (
        <Panel empty title="You’re all caught up">
          {inbox.lastSyncedAt && <p>Synced {relativeTime(inbox.lastSyncedAt)}</p>}
        </Panel>
      );
    }
  } else {
    body = (
      <div className={selection.selecting ? 'list selecting' : 'list'}>
        {visible.map((message) => (
          <MessageRow key={message.gmailId} message={message} pending={pending.has(message.gmailId)} selection={selection} />
        ))}
      </div>
    );
  }

  return (
    <div
      onTouchStart={(e) => {
        pullStart.current = window.scrollY === 0 ? (e.touches[0]?.clientY ?? null) : null;
      }}
      onTouchMove={(e) => {
        const y = e.touches[0]?.clientY;
        if (pullStart.current !== null && y !== undefined) {
          setPull(Math.max(0, Math.min(110, y - pullStart.current)));
        }
      }}
      onTouchEnd={() => {
        if (pull >= PULL_PX && inbox.state === 'ready') {
          onRefresh();
        }
        setPull(0);
        pullStart.current = null;
      }}
    >
      <div className="pull" style={{ height: inbox.refreshing ? 44 : pull * 0.5 }} aria-hidden={!inbox.refreshing}>
        {(inbox.refreshing || pull > 0) && <span className="spinner" />}
      </div>

      {body}

      {inbox.state === 'ready' && (
        <>
          {(inbox.loadingMore || filling) && (
            <div className="inline-row">
              <span className="spinner" />
              {filling && chip.kind !== 'all' ? 'Looking for more…' : null}
            </div>
          )}
          {inbox.moreError && !inbox.loadingMore && (
            <div className="inline-row">
              Couldn’t load more ·{' '}
              <button type="button" className="link-btn" onClick={onLoadMore}>
                Retry
              </button>
            </div>
          )}
          {lookFurther && !inbox.loadingMore && (
            <div className="inline-row">
              <button type="button" className="link-btn" onClick={onLookFurther}>
                Look further
              </button>
            </div>
          )}
          <div ref={sentinel} />
        </>
      )}
    </div>
  );
}
