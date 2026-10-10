import { useCallback, useEffect, useRef, useState } from 'react';
import { type ApiError, api, isAbort } from '../api/client';
import { asApiError, useStore } from '../state/store';
import { MessageRow } from './MessageRow';
import { Panel, Skeletons } from './ui';

const DEBOUNCE_MS = 300;

/**
 * Search (DESIGN_SPEC.md §5): `GET /api/v1/messages/search`. Only the latest query's response is
 * rendered; typing aborts the request in flight. Results keep their place after a row action,
 * with the badge updated from the returned `status`.
 */
export function SearchResults({ query }: { query: string }) {
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

  const results = ids.map((id) => s.get(id)).filter((m) => m !== undefined);

  if (state === 'loading' && results.length === 0) {
    return <Skeletons count={3} />;
  }
  if (state === 'error') {
    return error?.code === 'GMAIL_NOT_CONNECTED' || error?.code === 'UNAUTHENTICATED' ? null : (
      <Panel
        title="Search isn’t working right now"
        action={
          <button type="button" className="primary-btn" onClick={() => (setState('loading'), void run(query, null))}>
            Retry
          </button>
        }
      />
    );
  }
  return (
    <div style={state === 'loading' ? { opacity: 0.55 } : undefined}>
      {hint && <p className="hint">{hint}</p>}
      {results.length === 0 && !hint ? (
        <Panel title={`No messages match “${query}”`}>
          <p>Search covers the mail VibeMail has synced, including archived and trashed messages.</p>
        </Panel>
      ) : (
        <div className="list">
          {results.map((message) => (
            <MessageRow key={message.gmailId} message={message} pending={s.pending.has(message.gmailId)} terms={terms} showStatus />
          ))}
        </div>
      )}
      {loadingMore && (
        <div className="inline-row">
          <span className="spinner" />
        </div>
      )}
      {moreError && (
        <div className="inline-row">
          Couldn’t load more ·{' '}
          <button type="button" className="text-btn" onClick={() => (setMoreError(false), setLoadingMore(true), void run(query, cursor))}>
            Retry
          </button>
        </div>
      )}
      <div ref={sentinel} />
    </div>
  );
}
