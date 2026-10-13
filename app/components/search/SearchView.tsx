import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, api, isAbort } from '@/app/services';
import type { MessageDTO } from '@/app/services/types';
import { asApiError, useStore } from '@/state/store';
import { Panel, Skeletons } from '@/app/components/ui';
import { SearchResultList } from '@/app/components/search/SearchResultList';

const DEBOUNCE_MS = 300;

/**
 * Search (DESIGN_SPEC.md §5): `GET /api/v1/messages/search`, 300 ms after the last keystroke.
 * Only the latest query's response is rendered; typing aborts the request in flight. Results keep
 * their place after a row action, with the badge updated from the returned `status`.
 *
 *   SearchView          query, paging, loading and error states
 *   └─ SearchResultList results (inbox rows) or "No messages match your search."
 */
export function SearchView({ query }: { query: string }) {
  const s = useStore();
  const [ids, setIds] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const terms = query.split(/\s+/).filter(Boolean);

  const run = useCallback(async (q: string, after: string | null) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const page = await api.search(q, after ?? undefined, 25, current.signal);
      if (current.signal.aborted) {
        return;
      }
      s.upsertMany(page.messages);
      setIds((prev) => [...(after ? prev : []), ...page.messages.map((m) => m.gmailId)]);
      setCursor(page.nextCursor);
      setState('ready');
      setHint(null);
    } catch (err) {
      if (isAbort(err) || current.signal.aborted) {
        return;
      }
      const apiError = asApiError(err);
      if (apiError.code === 'VALIDATION_FAILED') {
        const field = (apiError.details?.issues as Array<{ field?: string }> | undefined)?.[0]?.field;
        if (field === 'cursor' && after) {
          void run(q, null); // A stale cursor restarts the query.
          return;
        }
        setHint('Search needs 2–200 characters');
        setState('ready');
        return;
      }
      if (after) {
        setMoreError(true);
      } else {
        setError(apiError);
        setState('error');
      }
    } finally {
      if (controller.current === current) {
        setLoadingMore(false);
      }
    }
  }, [s]);

  useEffect(() => {
    setState((prev) => (prev === 'ready' ? prev : 'loading'));
    setError(null);
    const timer = window.setTimeout(() => {
      setCursor(null);
      setMoreError(false);
      void run(query, null);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query, run]);

  useEffect(() => () => controller.current?.abort(), []);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || state !== 'ready') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !loadingMore && !moreError) {
          setLoadingMore(true);
          void run(query, cursor);
        }
      },
      { rootMargin: '0px 0px 100% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, state, loadingMore, moreError, query, run]);

  const results = ids.map((id) => s.get(id)).filter((m): m is MessageDTO => m !== undefined);

  if (state === 'loading' && results.length === 0) {
    return <Skeletons count={3} />;
  }
  if (state === 'error') {
    return error?.code === 'GMAIL_NOT_CONNECTED' || error?.code === 'UNAUTHENTICATED' ? null : (
      <Panel
        title="Search isn’t working right now"
        action={
          <button type="button" className="secondary-btn" onClick={() => (setState('loading'), void run(query, null))}>
            Retry
          </button>
        }
      />
    );
  }
  return (
    <div className={state === 'loading' ? 'search-results refining' : 'search-results'}>
      {hint && <p className="hint">{hint}</p>}
      {!hint && (
        <SearchResultList
          results={results}
          terms={terms}
          pending={s.pending}
          loadingMore={loadingMore}
          moreError={moreError}
          onRetryMore={() => (setMoreError(false), setLoadingMore(true), void run(query, cursor))}
        />
      )}
      <div ref={sentinel} />
    </div>
  );
}
