import { useEffect, useState } from 'react';
import { api } from '@/app/services';
import type { DraftDTO } from '@/app/services/types';
import { useCompose } from '@/app/components/compose/ComposeContext';
import { clearDraftSnapshot, loadDraftSnapshot } from '@/app/lib/draftStore';
import { relativeTime } from '@/app/lib/format';
import { draftGone, loadDrafts, loadMoreDrafts, useDrafts } from '@/state/drafts';
import { asApiError, store } from '@/state/store';
import { useNearEnd } from '@/app/components/inbox/useNearEnd';
import { Panel, Skeletons } from '@/app/components/ui';
import { DraftRow } from '@/app/components/drafts/DraftRow';

/**
 * Drafts (DESIGN_SPEC.md §4 Drafts): the user's Gmail drafts from `GET /api/v1/drafts`
 * (CONTRACT.md §4.13), newest first, in place of the message list. Opening Drafts reads the list
 * again; a draft opens in the compose drawer.
 */
export function DraftsView() {
  const drafts = useDrafts();
  const compose = useCompose();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  // Opening Drafts reads the list again (a fresh read when it was never loaded or failed).
  useEffect(() => {
    void loadDrafts({ refresh: true });
  }, []);

  const sentinel = useNearEnd(() => {
    if (!drafts.moreError) {
      void loadMoreDrafts();
    }
  }, drafts.state === 'ready' && drafts.nextCursor !== null);

  const discard = async (draft: DraftDTO) => {
    setPending((p) => new Set(p).add(draft.draftId));
    try {
      await api.deleteDraft(draft.draftId);
      draftGone(draft.draftId);
      store.toast('Draft discarded');
    } catch (error) {
      if (asApiError(error).code === 'MESSAGE_NOT_FOUND') {
        draftGone(draft.draftId); // Already deleted elsewhere.
      } else {
        store.toast('Couldn’t delete the draft in Gmail');
      }
    } finally {
      if (loadDraftSnapshot()?.draftId === draft.draftId) {
        clearDraftSnapshot();
      }
      setPending((p) => {
        const next = new Set(p);
        next.delete(draft.draftId);
        return next;
      });
    }
  };

  let body;
  if (drafts.state === 'idle' || drafts.state === 'loading') {
    body = <Skeletons count={6} />;
  } else if (drafts.state === 'error') {
    body =
      drafts.error?.code === 'GMAIL_NOT_CONNECTED' || drafts.error?.code === 'GMAIL_TOKEN_REVOKED' ? null : (
        <Panel
          title="Couldn’t load your drafts"
          action={
            // Retry only when it can help: `retryable`, or INTERNAL (DESIGN_SPEC.md shared rules).
            drafts.error?.canRetry ? (
              <button type="button" className="secondary-btn" onClick={() => void loadDrafts()}>
                Retry
              </button>
            ) : undefined
          }
        />
      );
  } else if (drafts.drafts.length === 0) {
    body = (
      <Panel empty title="No drafts.">
        <p>Drafts you save here or in Gmail appear here.</p>
      </Panel>
    );
  } else {
    body = (
      <div className="list">
        {drafts.drafts.map((draft) => (
          <DraftRow
            key={draft.draftId}
            draft={draft}
            pending={pending.has(draft.draftId)}
            onOpen={(d) => compose.open({ draft: d })}
            onDiscard={(d) => void discard(d)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="status-line">
        <h1 className="list-title">Drafts</h1>
        <p className="synced" aria-live="polite">
          {drafts.state === 'ready' && drafts.readAt && `Updated ${relativeTime(drafts.readAt)}`}
        </p>
      </div>
      {body}
      {drafts.state === 'ready' && (
        <>
          {drafts.loadingMore && (
            <div className="inline-row">
              <span className="spinner" />
            </div>
          )}
          {drafts.moreError && !drafts.loadingMore && (
            <div className="inline-row">
              Couldn’t load more
              {drafts.moreError.canRetry && (
                <>
                  {' · '}
                  <button type="button" className="link-btn" onClick={() => void loadMoreDrafts()}>
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
          <div ref={sentinel} />
        </>
      )}
    </>
  );
}
