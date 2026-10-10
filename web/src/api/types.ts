/**
 * Wire types from CONTRACT.md. Field names are the contract's, unchanged: §3.3 (errors),
 * §3.4 (`MessageDTO`), §3.7 (`DraftDTO`) and the §4 request/response shapes.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'GMAIL_NOT_CONNECTED'
  | 'GMAIL_TOKEN_REVOKED'
  | 'VALIDATION_FAILED'
  | 'MESSAGE_NOT_FOUND'
  | 'GMAIL_RATE_LIMITED'
  | 'GMAIL_UPSTREAM_ERROR'
  | 'SYNC_FAILED'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFIG_ERROR'
  | 'INTERNAL';

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; retryable: boolean; details?: Record<string, unknown> };
}

export interface AttachmentMeta {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

/** Derived by the server from `labelIds` at write time. The frontend reads it and never sets it. */
export type MessageStatus = 'inbox' | 'sent' | 'archived' | 'trash' | 'spam';

export interface MessageDTO {
  gmailId: string;
  threadId: string;
  labelIds: string[];
  status: MessageStatus;
  isRead: boolean;
  isStarred: boolean;
  snippet: string;
  historyId: string;
  internalDate: string;
  sizeEstimate: number;
  subject: string | null;
  fromAddress: string;
  toAddress: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  rfc822MessageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  dateHeader: string | null;
  bodyPlain: string | null;
  bodyHtml: string | null;
  attachments: AttachmentMeta[];
  syncedAt: string;
}

/** `draftId` is server-managed: received here, echoed only in a path, never sent in a body. */
export interface DraftDTO {
  draftId: string;
  gmailId: string;
  threadId: string;
  to: string[];
  subject: string;
  body: string;
  updatedAt: string;
}

export interface ListMessagesResponse {
  messages: MessageDTO[];
  nextCursor: string | null;
  lastSyncedAt: string | null;
}

export interface SearchMessagesResponse {
  messages: MessageDTO[];
  nextCursor: string | null;
}

export interface ThreadResponse {
  threadId: string;
  messages: MessageDTO[];
  truncated: boolean;
}

/** §4.7. There is deliberately no `status` field: status changes only through labels. */
export interface UpdateLabelsRequest {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

/** §4.3 `POST /api/v1/messages/send`. */
export interface SendMessageRequest {
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
}

/** §3.7 `DraftRequest`. There is deliberately no `draftId` field. */
export interface DraftRequest {
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
}
