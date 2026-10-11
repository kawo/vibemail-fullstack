import type { MessageDTO } from '../../api/types';
import { MessageRow } from '../inbox/MessageRow';
import { Panel } from '../ui';

/**
 * Search results (DESIGN_SPEC.md §5): inbox rows with the query terms highlighted and a status
 * badge for archived, sent, trashed and spam results; or the centred no-results state. The
 * paging rows at the end follow the inbox's.
 */
export function SearchResultList({
  results,
  terms,
  pending,
  loadingMore,
  moreError,
  onRetryMore,
}: {
  results: readonly MessageDTO[];
  terms: readonly string[];
  pending: ReadonlySet<string>;
  loadingMore: boolean;
  moreError: boolean;
  onRetryMore: () => void;
}) {
  if (results.length === 0) {
    return (
      <Panel empty title="No messages match your search.">
        <p>Search covers the mail VibeMail has synced, including archived and trashed messages.</p>
      </Panel>
    );
  }
  return (
    <>
      <p className="result-count" aria-live="polite">
        {results.length} {results.length === 1 ? 'result' : 'results'}
      </p>
      <div className="list">
        {results.map((message) => (
          <MessageRow key={message.gmailId} message={message} pending={pending.has(message.gmailId)} terms={terms} showStatus />
        ))}
      </div>
      {loadingMore && (
        <div className="inline-row">
          <span className="spinner" />
        </div>
      )}
      {moreError && (
        <div className="inline-row">
          Couldn’t load more ·{' '}
          <button type="button" className="link-btn" onClick={onRetryMore}>
            Retry
          </button>
        </div>
      )}
    </>
  );
}
