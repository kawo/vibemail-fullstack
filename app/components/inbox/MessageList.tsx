import { type Ref, useRef, useState } from 'react';
import type { MessageDTO } from '@/app/services/types';
import { type Chip, emptyStateText } from '@/app/lib/filters';
import { relativeTime } from '@/app/lib/format';
import type { ListState } from '@/state/store';
import { Panel, Skeletons } from '@/app/components/ui';
import { MessageRow } from '@/app/components/MessageRow';

const PULL_PX = 70;

/**
 * One label's server-filtered list and every state it can be in (DESIGN_SPEC.md §1, §4):
 * first-load skeletons, the load error, the three empty states, the rows, and the paging rows at
 * the end (loading more, "Couldn't load more · Retry"). Pull to refresh re-reads the first page.
 */
export function MessageList({
  list,
  loadedCount,
  visible,
  chip,
  pending,
  sentinel,
  onRetry,
  onRefresh,
  onLoadMore,
  selection,
}: {
  list: ListState;
  loadedCount: number;
  visible: readonly MessageDTO[];
  chip: Chip;
  pending: ReadonlySet<string>;
  sentinel: Ref<HTMLDivElement>;
  onRetry: () => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  selection: { order: readonly string[]; selecting: boolean };
}) {
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const emptyChipText = emptyStateText(chip);

  let body;
  if (list.state === 'loading' || list.state === 'idle') {
    body = <Skeletons count={8} />;
  } else if (list.state === 'error') {
    // GMAIL_NOT_CONNECTED is handled by the app-wide reconnect panel.
    body =
      list.error?.code === 'GMAIL_NOT_CONNECTED' ? null : (
        <Panel
          title="Couldn’t load your mail"
          action={
            // Retry only when it can help: `retryable`, or INTERNAL (DESIGN_SPEC.md shared rules).
            list.error?.canRetry ? (
              <button type="button" className="secondary-btn" onClick={onRetry}>
                Retry
              </button>
            ) : undefined
          }
        />
      );
  } else if (visible.length === 0) {
    if (emptyChipText) {
      body = (
        <Panel empty title={emptyChipText}>
          {chip.kind !== 'starred' && <p>Only mail VibeMail has synced appears here.</p>}
        </Panel>
      );
    } else if (list.lastSyncedAt === null && loadedCount === 0) {
      body = (
        <Panel empty title="Your mailbox is syncing">
          <p>New mail will appear here as it arrives.</p>
        </Panel>
      );
    } else {
      body = (
        <Panel empty title="You’re all caught up">
          {list.lastSyncedAt && <p>Synced {relativeTime(list.lastSyncedAt)}</p>}
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
        if (pull >= PULL_PX && list.state === 'ready') {
          onRefresh();
        }
        setPull(0);
        pullStart.current = null;
      }}
    >
      <div className="pull" style={{ height: list.refreshing ? 44 : pull * 0.5 }} aria-hidden={!list.refreshing}>
        {(list.refreshing || pull > 0) && <span className="spinner" />}
      </div>

      {body}

      {list.state === 'ready' && (
        <>
          {list.loadingMore && (
            <div className="inline-row">
              <span className="spinner" />
            </div>
          )}
          {list.moreError && !list.loadingMore && (
            <div className="inline-row">
              Couldn’t load more
              {list.moreError.canRetry && (
                <>
                  {' · '}
                  <button type="button" className="link-btn" onClick={onLoadMore}>
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
          <div ref={sentinel} />
        </>
      )}
    </div>
  );
}
