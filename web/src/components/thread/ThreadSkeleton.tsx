import type { MessageDTO } from '../../api/types';
import { displayName } from '../../lib/format';
import { Avatar } from './Avatar';

/**
 * Thread loading state (DESIGN_SPEC.md §2): a skeleton title and three skeleton cards. When the
 * thread was opened from the inbox, the tapped row's cached subject and snippet show at once.
 */
export function ThreadSkeleton({ cached }: { cached: MessageDTO | undefined }) {
  return (
    <div className="thread-body" aria-busy="true" aria-label="Loading conversation">
      {cached?.subject ? <h1 className="thread-title">{cached.subject}</h1> : <div className="skeleton bare title-skeleton" />}
      {cached && (
        <div className="glass card">
          <div className="card-head">
            <Avatar fromAddress={cached.fromAddress} size="sm" />
            <span className="who">{displayName(cached.fromAddress)}</span>
            <span className="collapsed-snippet">{cached.snippet}</span>
          </div>
        </div>
      )}
      {Array.from({ length: cached ? 2 : 3 }, (_, i) => (
        <div key={i} className="skeleton bare card-skeleton" />
      ))}
    </div>
  );
}
