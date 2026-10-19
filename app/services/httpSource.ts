import { currentSession, refreshSession, signOut } from '@/app/lib/auth/session';
import { ApiError, emitApiSignal } from './errors';
import type { DataSource } from './source';
import type {
  AttachmentDownloadResponse,
  AttachmentUploadRequest,
  AttachmentUploadResponse,
  DraftDTO,
  DraftRequest,
  ErrorEnvelope,
  ListDraftsResponse,
  ListMessagesResponse,
  MessageDTO,
  SearchMessagesResponse,
  SendMessageRequest,
  ThreadResponse,
  UpdateLabelsRequest,
} from '@/app/services/types';

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
  // Relative: the engine is served from this origin (Next.js route re-exports).
  return fetch(path, {
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
 * request; if that fails it signs out, which clears the stored JWT and sends the user to the
 * sign-in page with a session-expired message. `GMAIL_NOT_CONNECTED` / `GMAIL_TOKEN_REVOKED` raise the
 * reconnect signal. Errors are thrown as `ApiError`.
 */
async function call<T>(method: string, path: string, options: CallOptions = {}): Promise<T> {
  let session = await currentSession();
  let response = await send(method, path, session?.accessToken, options);
  if (response.status === 401) {
    const error = await toApiError(response.clone());
    if (error.code === 'UNAUTHENTICATED') {
      session = await refreshSession();
      if (!session) {
        await signOut('expired');
        emitApiSignal('signed-out');
        throw error;
      }
      response = await send(method, path, session.accessToken, options);
      if (response.status === 401 && (await toApiError(response.clone())).code === 'UNAUTHENTICATED') {
        await signOut('expired');
        emitApiSignal('signed-out');
      }
    }
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if ((error.code === 'GMAIL_NOT_CONNECTED' || error.code === 'GMAIL_TOKEN_REVOKED') && !options.quietReconnect) {
      emitApiSignal('reconnect');
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

/** The CONTRACT.md §4 endpoints over HTTP, by exact relative path on this origin. */
export const httpSource: DataSource = {
  listMessages: (label: string, cursor?: string, limit = 25, signal?: AbortSignal) =>
    call<ListMessagesResponse>('GET', `/api/v1/messages${query({ limit, cursor, label })}`, signal ? { signal } : {}),

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

  downloadAttachment: (gmailId: string, partId: string) =>
    call<AttachmentDownloadResponse>(
      'GET',
      `/api/v1/messages/${encodeURIComponent(gmailId)}/attachments/${encodeURIComponent(partId)}`,
    ),

  reserveAttachment: (request: AttachmentUploadRequest, signal?: AbortSignal) =>
    call<AttachmentUploadResponse>('POST', '/api/v1/attachments', { body: request, ...(signal ? { signal } : {}) }),
};
