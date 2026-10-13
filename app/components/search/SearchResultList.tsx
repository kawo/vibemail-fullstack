import type { MessageDTO } from '@/app/services/types';
import { MessageRow } from '@/app/components/MessageRow';
import { SelectBox } from '@/app/components/inbox/SelectBox';
import { SelectionBar } from '@/app/components/inbox/SelectionBar';
import { useListSelection } from '@/app/components/inbox/useListSelection';
import { Panel } from '@/app/components/ui';

/**
 * Search results (DESIGN_SPEC.md §5): inbox rows with the query terms highlighted and a status
 * badge for archived, sent, trashed and spam results; or the centred no-results state. The
 * paging rows at the end follow the inbox's. Results can be selected like inbox rows; the
 * selection bar then takes the result count's place.
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
  const selection = useListSelection(results);
  if (results.length === 0) {
    return (
      <Panel empty title="No messages match your search.">
        <p>Search covers the mail VibeMail has synced, including archived and trashed messages.</p>
      </Panel>
    );
  }
  return (
    <>
      {selection.selecting ? (
        <SelectionBar
          selected={selection.selectedListed}
          listed={results.length}
          onSelectAll={selection.selectAll}
          onClear={selection.clearSelection}
        />
      ) : (
        <div className="result-count">
          <SelectBox state="none" label="Select all" onToggle={() => selection.selectAll(true)} />
          <p aria-live="polite">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </p>
        </div>
      )}
      <div className={selection.selecting ? 'list selecting' : 'list'}>
        {results.map((message) => (
          <MessageRow
            key={message.gmailId}
            variant="search"
            message={message}
            pending={pending.has(message.gmailId)}
            terms={terms}
            selection={{ order: selection.order, selecting: selection.selecting }}
          />
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
