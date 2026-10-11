import { API_URL, currentSession, refreshSession, signOut } from '../auth/session';
import type {
  DraftDTO,
  DraftRequest,
  ErrorCode,
  ErrorEnvelope,
  ListDraftsResponse,
  ListMessagesResponse,
  MessageDTO,
  SearchMessagesResponse,
  SendMessageRequest,
  ThreadResponse,
  UpdateLabelsRequest,
} from './types';

/** A §3.3 error envelope, with the `Retry-After` header when Gmail rate-limited the call. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, envelope: ErrorEnvelope['error'], retryAfterSeconds?: number) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.retryable = envelope.retryable;
    this.details = envelope.details;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** The shared retry rule: offer Retry when `retryable`, or for `INTERNAL`. */
  get canRetry(): boolean {
    return this.retryable || this.code === 'INTERNAL';
  }
}

/** App-wide signals the views react to: signed out, or Gmail needs reconnecting. */
type Signal = 'signed-out' | 'reconnect';
const listeners = new Set<(signal: Signal) => void>();

export function onApiSignal(listener: (signal: Signal) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(signal: Signal): void {
  for (const listener of listeners) {
    listener(signal);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope['error'] = { code: 'INTERNAL', message: response.statusText, retryable: false };
  try {
    const body = (await response.json()) as Partial<ErrorEnvelope>;
    if (body.error?.code) {
      envelope = body.error;
    }
  } catch {
    // Not JSON (e.g. a proxy error page): keep the INTERNAL fallback.
  }
  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiError(response.status, envelope, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
}

interface CallOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Don't raise the reconnect signal; the caller decides when (compose autosave defers it). */
  quietReconnect?: boolean;
}

async function send(method: string, path: string, token: string | undefined, options: CallOptions): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * Every `/api/v1` call. On `UNAUTHENTICATED` it refreshes the session once and repeats the
 * request; if that fails it signs out. `GMAIL_NOT_CONNECTED` / `GMAIL_TOKEN_REVOKED` raise the
 * reconnect signal. Errors are thrown as `ApiError`.
 */
async function call<T>(method: string, path: string, options: CallOptions = {}): Promise<T> {
  let session = await currentSession();
  let response = await send(method, path, session?.access_token, options);
  if (response.status === 401) {
    const error = await toApiError(response.clone());
    if (error.code === 'UNAUTHENTICATED') {
      session = await refreshSession();
      if (!session) {
        await signOut();
        emit('signed-out');
        throw error;
      }
      response = await send(method, path, session.access_token, options);
      if (response.status === 401 && (await toApiError(response.clone())).code === 'UNAUTHENTICATED') {
        await signOut();
        emit('signed-out');
      }
    }
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if ((error.code === 'GMAIL_NOT_CONNECTED' || error.code === 'GMAIL_TOKEN_REVOKED') && !options.quietReconnect) {
      emit('reconnect');
    }
    throw error;
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** The CONTRACT.md §4 endpoints the frontend uses, by exact path. */
export const api = {
  listMessages: (cursor?: string, limit = 25, signal?: AbortSignal) =>
    call<ListMessagesResponse>('GET', `/api/v1/messages${query({ limit, cursor })}`, signal ? { signal } : {}),

  markRead: (gmailId: string) =>
    call<{ message: MessageDTO }>('POST', `/api/v1/messages/${encodeURIComponent(gmailId)}/read`),

  updateLabels: (gmailId: string, change: UpdateLabelsRequest) =>
    call<{ message: MessageDTO }>('PATCH', `/api/v1/messages/${encodeURIComponent(gmailId)}`, { body: change }),

  getThread: (threadId: string, signal?: AbortSignal) =>
    call<ThreadResponse>('GET', `/api/v1/threads/${encodeURIComponent(threadId)}`, signal ? { signal } : {}),

  search: (q: string, cursor?: string, limit = 25, signal?: AbortSignal) =>
    call<SearchMessagesResponse>('GET', `/api/v1/messages/search${query({ q, limit, cursor })}`, signal ? { signal } : {}),

  send: (request: SendMessageRequest) =>
    call<{ message: MessageDTO }>('POST', '/api/v1/messages/send', { body: request }),

  listDrafts: (cursor?: string, limit = 25, signal?: AbortSignal) =>
    call<ListDraftsResponse>('GET', `/api/v1/drafts${query({ limit, cursor })}`, signal ? { signal } : {}),

  createDraft: (request: DraftRequest) =>
    call<{ draft: DraftDTO }>('POST', '/api/v1/drafts', { body: request, quietReconnect: true }),

  updateDraft: (draftId: string, request: DraftRequest) =>
    call<{ draft: DraftDTO }>('PATCH', `/api/v1/drafts/${encodeURIComponent(draftId)}`, {
      body: request,
      quietReconnect: true,
    }),

  deleteDraft: (draftId: string) =>
    call<undefined>('DELETE', `/api/v1/drafts/${encodeURIComponent(draftId)}`, { quietReconnect: true }),
};

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
