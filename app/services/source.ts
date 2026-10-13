import type {
  DraftDTO,
  DraftRequest,
  ListDraftsResponse,
  ListMessagesResponse,
  MessageDTO,
  SearchMessagesResponse,
  SendMessageRequest,
  ThreadResponse,
  UpdateLabelsRequest,
} from './types';

/**
 * Everything the UI asks of the engine: one method per CONTRACT.md §4 endpoint it uses, with the
 * contract's request and response shapes. Components and state only ever talk to this.
 *
 * Phase 1 serves it from the sample data (sampleSource.ts); Phase 2 from the engine over HTTP
 * (httpSource.ts). Both throw `ApiError` with a §3.3 code on failure.
 */
export interface DataSource {
  /** §4.2 `GET /api/v1/messages` */
  listMessages(cursor?: string, limit?: number, signal?: AbortSignal): Promise<ListMessagesResponse>;
  /** §4.4 `POST /api/v1/messages/{id}/read` */
  markRead(gmailId: string): Promise<{ message: MessageDTO }>;
  /** §4.7 `PATCH /api/v1/messages/{id}` */
  updateLabels(gmailId: string, change: UpdateLabelsRequest): Promise<{ message: MessageDTO }>;
  /** §4.8 `GET /api/v1/threads/{threadId}` */
  getThread(threadId: string, signal?: AbortSignal): Promise<ThreadResponse>;
  /** §4.9 `GET /api/v1/messages/search` */
  search(q: string, cursor?: string, limit?: number, signal?: AbortSignal): Promise<SearchMessagesResponse>;
  /** §4.3 `POST /api/v1/messages/send` */
  send(request: SendMessageRequest): Promise<{ message: MessageDTO }>;
  /** §4.13 `GET /api/v1/drafts` */
  listDrafts(cursor?: string, limit?: number, signal?: AbortSignal): Promise<ListDraftsResponse>;
  /** §4.10 `POST /api/v1/drafts` */
  createDraft(request: DraftRequest): Promise<{ draft: DraftDTO }>;
  /** §4.11 `PATCH /api/v1/drafts/{draftId}` */
  updateDraft(draftId: string, request: DraftRequest): Promise<{ draft: DraftDTO }>;
  /** §4.12 `DELETE /api/v1/drafts/{draftId}` */
  deleteDraft(draftId: string): Promise<undefined>;
}
