import { SAMPLE_ACCOUNT, SAMPLE_NOW, drafts as sampleDrafts, earlierMessages, messages as sampleMessages } from '@/data/data';
import { ApiError } from './errors';
import type { DataSource } from './source';
import type { DraftDTO, DraftRequest, ErrorCode, MessageDTO, MessageStatus, SendMessageRequest, UpdateLabelsRequest } from './types';

/**
 * Phase 1: CONTRACT.md §4 served from the sample data in data/data.js, in memory.
 *
 * It behaves as the engine is contracted to: `status`, `isRead` and `isStarred` derived from
 * `labelIds` on every write (§3.4); label changes validated as §4.7 (TRASH alone, no DRAFT, SENT,
 * SPAM or CHAT); trash and untrash as Gmail does them; keyset-style cursors; §3.3 errors. data.js
 * is copied once and never written to.
 *
 * Dev-only `?state=` hooks keep the DESIGN_SPEC states reachable without a backend, and stick for
 * the tab (sessionStorage): `empty` (synced, nothing stored), `syncing` (nothing synced yet),
 * `error` (the list fails), `ratelimit` (label changes and sends hit GMAIL_RATE_LIMITED),
 * `reconnect` (GMAIL_NOT_CONNECTED), `clear` (back to normal).
 */

type SampleState = 'normal' | 'empty' | 'syncing' | 'error' | 'ratelimit' | 'reconnect';
const STATES: readonly SampleState[] = ['normal', 'empty', 'syncing', 'error', 'ratelimit', 'reconnect'];
const STATE_KEY = 'vibemail.sample.state';
const LATENCY_MS = 220;

/** The §3.4 rule, first match wins. */
export function deriveStatus(labelIds: readonly string[]): MessageStatus {
  if (labelIds.includes('TRASH')) return 'trash';
  if (labelIds.includes('SPAM')) return 'spam';
  if (labelIds.includes('INBOX')) return 'inbox';
  if (labelIds.includes('SENT')) return 'sent';
  return 'archived';
}

/** Recomputes the fields the server derives from `labelIds` (§3.4, §4.7 step 4). */
export function withLabels(message: MessageDTO, labelIds: readonly string[]): MessageDTO {
  return {
    ...message,
    labelIds: [...labelIds],
    status: deriveStatus(labelIds),
    isRead: !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
    syncedAt: new Date().toISOString(),
  };
}

const REJECTED_LABELS = new Set(['DRAFT', 'SENT', 'SPAM', 'CHAT']);

/** §4.7 validation: every failure, as `details.issues`. */
export function labelIssues(change: UpdateLabelsRequest): string[] {
  const add = change.addLabelIds ?? [];
  const remove = change.removeLabelIds ?? [];
  const issues: string[] = [];
  const known = new Set(['addLabelIds', 'removeLabelIds']);
  for (const key of Object.keys(change)) {
    if (!known.has(key)) issues.push(`${key} is not accepted`);
  }
  if (add.length + remove.length === 0) issues.push('at least one label is required');
  if (add.length > 20 || remove.length > 20) issues.push('at most 20 labels in each list');
  if ([...add, ...remove].some((l) => typeof l !== 'string' || l === '')) issues.push('labels must be non-empty strings');
  if (add.some((l) => remove.includes(l))) issues.push('a label appears in both lists');
  if ([...add, ...remove].some((l) => REJECTED_LABELS.has(l))) issues.push('DRAFT, SENT, SPAM and CHAT cannot be changed');
  if ([...add, ...remove].includes('TRASH') && add.length + remove.length > 1) issues.push('TRASH must be the only label');
  return issues;
}

function fail(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>, retryAfterSeconds?: number): never {
  const retryable = code === 'GMAIL_RATE_LIMITED' || code === 'GMAIL_UPSTREAM_ERROR';
  throw new ApiError(status, { code, message, retryable, ...(details ? { details } : {}) }, retryAfterSeconds);
}

const encodeCursor = (offset: number) => btoa(JSON.stringify({ o: offset }));
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(atob(cursor)) as { o?: unknown };
    if (typeof value.o === 'number' && value.o >= 0) return value.o;
  } catch {
    // Falls through to the error below.
  }
  return fail(400, 'VALIDATION_FAILED', 'cursor is invalid', { issues: [{ field: 'cursor' }] });
}

function page<T>(items: readonly T[], cursor: string | undefined, limit: number): { items: T[]; nextCursor: string | null } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    fail(400, 'VALIDATION_FAILED', 'limit must be an integer in 1..100', { issues: [{ field: 'limit' }] });
  }
  const start = decodeCursor(cursor);
  const end = start + limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? encodeCursor(end) : null };
}

const byNewest = (a: MessageDTO, b: MessageDTO) =>
  a.internalDate === b.internalDate ? (a.gmailId < b.gmailId ? 1 : -1) : a.internalDate < b.internalDate ? 1 : -1;

/** Builds an independent sample engine. The app uses one; tests make their own. */
export function createSampleSource(options: { state?: SampleState; latencyMs?: number; now?: number } = {}): DataSource {
  const latency = options.latencyMs ?? LATENCY_MS;
  const state = (): SampleState => options.state ?? readState();
  // Shift every timestamp so the sample reads as recent: SAMPLE_NOW becomes "now".
  const shift = (options.now ?? Date.now()) - Date.parse(SAMPLE_NOW);
  const moved = (iso: string) => new Date(Date.parse(iso) + shift).toISOString();
  const copy = (m: MessageDTO): MessageDTO => ({
    ...m,
    labelIds: [...m.labelIds],
    toAddress: [...m.toAddress],
    ccAddresses: [...m.ccAddresses],
    bccAddresses: [...m.bccAddresses],
    attachments: m.attachments.map((a) => ({ ...a })),
    internalDate: moved(m.internalDate),
    syncedAt: moved(m.syncedAt),
  });

  const store = new Map<string, MessageDTO>();
  /** The messages §4.2 lists (stored by sync or send); earlier thread messages are only in threads. */
  const listed = new Set<string>();
  for (const m of sampleMessages) {
    store.set(m.gmailId, copy(m));
    listed.add(m.gmailId);
  }
  for (const m of earlierMessages) store.set(m.gmailId, copy(m));
  /** Gmail's trash drops INBOX and untrash puts it back; remember which had it. */
  const hadInbox = new Set<string>();
  const drafts = new Map<string, DraftDTO>(sampleDrafts.map((d) => [d.draftId, { ...d, to: [...d.to], updatedAt: moved(d.updatedAt) }]));
  let seq = 0;

  const wait = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const timer = setTimeout(resolve, latency);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });

  const gate = (kind: 'read' | 'write') => {
    const s = state();
    if (s === 'reconnect') fail(409, 'GMAIL_NOT_CONNECTED', 'Gmail is not connected');
    if (s === 'ratelimit' && kind === 'write') fail(429, 'GMAIL_RATE_LIMITED', 'Gmail rate limit', undefined, 12);
  };

  const get = (gmailId: string): MessageDTO => store.get(gmailId) ?? fail(404, 'MESSAGE_NOT_FOUND', 'No such message', { gmailId });
  const put = (m: MessageDTO): MessageDTO => {
    store.set(m.gmailId, m);
    return m;
  };
  const sortedListed = () => {
    const s = state();
    if (s === 'empty' || s === 'syncing') return [];
    return [...listed].map((id) => store.get(id)).filter((m): m is MessageDTO => m !== undefined).sort(byNewest);
  };

  const makeDraft = (draftId: string, request: DraftRequest, threadId?: string): DraftDTO => {
    seq += 1;
    const to = request.to === undefined ? [] : Array.isArray(request.to) ? request.to : [request.to];
    return {
      draftId,
      gmailId: `sample-draft-msg-${seq}`,
      threadId: request.threadId ?? threadId ?? `sample-thread-${seq}`,
      to,
      subject: request.subject ?? '',
      body: request.body ?? '',
      updatedAt: new Date().toISOString(),
    };
  };

  const checkThread = (threadId: string | undefined) => {
    if (threadId !== undefined && ![...store.values()].some((m) => m.threadId === threadId) && ![...drafts.values()].some((d) => d.threadId === threadId)) {
      fail(404, 'MESSAGE_NOT_FOUND', 'Unknown threadId', { threadId });
    }
  };

  return {
    async listMessages(cursor, limit = 25, signal) {
      await wait(signal);
      gate('read');
      if (state() === 'error') fail(500, 'INTERNAL', 'Sample list failure');
      const { items, nextCursor } = page(sortedListed(), cursor, limit);
      return { messages: items, nextCursor, lastSyncedAt: state() === 'syncing' ? null : new Date(Date.now() - 2 * 60_000).toISOString() };
    },

    async markRead(gmailId) {
      await wait();
      gate('write');
      const m = get(gmailId);
      return { message: put(withLabels(m, m.labelIds.filter((l) => l !== 'UNREAD'))) };
    },

    async updateLabels(gmailId, change) {
      await wait();
      gate('write');
      const issues = labelIssues(change);
      if (issues.length > 0) fail(400, 'VALIDATION_FAILED', 'Invalid label change', { issues });
      const m = get(gmailId);
      const add = change.addLabelIds ?? [];
      const remove = change.removeLabelIds ?? [];
      let labels = m.labelIds.filter((l) => !remove.includes(l));
      if (add.includes('TRASH')) {
        if (labels.includes('INBOX')) hadInbox.add(gmailId);
        labels = labels.filter((l) => l !== 'INBOX');
      }
      if (remove.includes('TRASH') && hadInbox.delete(gmailId) && !labels.includes('INBOX')) labels.push('INBOX');
      for (const l of add) if (!labels.includes(l)) labels.push(l);
      return { message: put(withLabels(m, labels)) };
    },

    async getThread(threadId, signal) {
      await wait(signal);
      gate('read');
      const thread = [...store.values()].filter((m) => m.threadId === threadId).sort((a, b) => -byNewest(a, b));
      if (thread.length === 0) fail(404, 'MESSAGE_NOT_FOUND', 'No stored messages in this thread', { threadId });
      return { threadId, messages: thread, truncated: false };
    },

    async search(q, cursor, limit = 25, signal) {
      await wait(signal);
      gate('read');
      const query = q.trim();
      if (query.length < 2 || query.length > 200) fail(400, 'VALIDATION_FAILED', 'q must be 2..200 characters', { issues: [{ field: 'q' }] });
      const terms = query.toLowerCase().split(/\s+/);
      const hits = [...store.values()]
        .filter((m) => {
          const hay = [m.subject ?? '', m.fromAddress, ...m.toAddress, m.snippet, m.bodyPlain ?? ''].join('\n').toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
        .sort(byNewest);
      const { items, nextCursor } = page(hits, cursor, limit);
      return { messages: items, nextCursor };
    },

    async send(request: SendMessageRequest) {
      await wait();
      gate('write');
      const to = Array.isArray(request.to) ? request.to : [request.to];
      if (to.length === 0 || to.some((a) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$|<[^\s@<>]+@[^\s@<>]+>/.test(a))) {
        fail(400, 'VALIDATION_FAILED', 'Invalid recipients', { issues: [{ field: 'to', message: 'Enter valid addresses' }] });
      }
      checkThread(request.threadId);
      seq += 1;
      const now = new Date().toISOString();
      const base = [...store.values()][0];
      if (!base) fail(500, 'INTERNAL', 'Sample store is empty');
      const message = withLabels(
        {
          ...base,
          gmailId: `sample-sent-${seq}`,
          threadId: request.threadId ?? `sample-thread-${seq}`,
          historyId: String(9000 + seq),
          internalDate: now,
          subject: request.subject || null,
          fromAddress: `You <${SAMPLE_ACCOUNT.email}>`,
          toAddress: to,
          ccAddresses: [],
          bccAddresses: [],
          snippet: (request.body ?? '').replace(/\s+/g, ' ').slice(0, 120),
          bodyPlain: request.body ?? '',
          bodyHtml: null,
          attachments: [],
          rfc822MessageId: null,
          inReplyTo: null,
          references: null,
          dateHeader: null,
        },
        ['SENT'],
      );
      put(message);
      listed.add(message.gmailId);
      return { message };
    },

    async listDrafts(cursor, limit = 25, signal) {
      await wait(signal);
      gate('read');
      const all = [...drafts.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      if (limit > 50) fail(400, 'VALIDATION_FAILED', 'limit must be an integer in 1..50', { issues: [{ field: 'limit' }] });
      const { items, nextCursor } = page(all, cursor, limit);
      return { drafts: items, nextCursor };
    },

    async createDraft(request) {
      await wait();
      gate('write');
      checkThread(request.threadId);
      seq += 1;
      const draft = makeDraft(`sample-draft-${seq}`, request);
      drafts.set(draft.draftId, draft);
      return { draft };
    },

    async updateDraft(draftId, request) {
      await wait();
      gate('write');
      const current = drafts.get(draftId) ?? fail(404, 'MESSAGE_NOT_FOUND', 'Unknown draft', { draftId });
      // §4.11: a full replacement; the draft keeps its draftId, its gmailId changes.
      const draft = makeDraft(draftId, request, current.threadId);
      drafts.set(draftId, draft);
      return { draft };
    },

    async deleteDraft(draftId) {
      await wait();
      gate('write');
      if (!drafts.delete(draftId)) fail(404, 'MESSAGE_NOT_FOUND', 'Unknown draft', { draftId });
      return undefined;
    },
  };
}

/** The dev `?state=` hook, kept for the tab. */
function readState(): SampleState {
  if (typeof window === 'undefined') return 'normal';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('state');
    if (fromUrl) {
      const next = fromUrl === 'clear' ? 'normal' : STATES.includes(fromUrl as SampleState) ? (fromUrl as SampleState) : 'normal';
      window.sessionStorage.setItem(STATE_KEY, next);
      return next;
    }
    const stored = window.sessionStorage.getItem(STATE_KEY);
    return STATES.includes(stored as SampleState) ? (stored as SampleState) : 'normal';
  } catch {
    return 'normal';
  }
}

export const sampleSource: DataSource = createSampleSource();
