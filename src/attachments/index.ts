import { randomUUID } from 'node:crypto';
import type { AttachmentsRepository } from '../db/attachments';
import { ApiError } from '../middleware/errors';
import type { AttachmentStore } from '../storage/attachments';

/** Attachment uploads, CONTRACT.md §4.14: reserve a row and a signed Storage upload URL. */

/** 25 MB, Gmail's attachment limit: per file here, per message on send (§4.3). */
export const MAX_ATTACHMENT_BYTES = 26_214_400;
export const MAX_FILENAME = 255;

const CONTROL_OR_SEPARATOR = /[\u0000-\u001f\u007f/\\]/;
/** `type/subtype` of RFC 7230 token characters, without parameters. */
const MIME_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export interface AttachmentDeps {
  attachments: AttachmentsRepository;
  attachmentStore: AttachmentStore;
  newId?: () => string;
  log?: (message: string, error?: unknown) => void;
}

export interface AttachmentUploadResponse {
  attachment: { attachmentId: string; filename: string; mimeType: string; size: number; createdAt: string };
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
}

const invalid = (field: string, message: string) => new ApiError('VALIDATION_FAILED', message, { details: { field } });

/** Validates an untrusted body; the first failing field wins (§4.14 step 2). */
export function validateUpload(input: unknown): { filename: string; mimeType: string; size: number } {
  const record = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const filename = typeof record.filename === 'string' ? record.filename.trim() : null;
  if (filename === null || filename.length === 0 || filename.length > MAX_FILENAME || CONTROL_OR_SEPARATOR.test(filename)) {
    throw invalid('filename', `filename must be 1..${MAX_FILENAME} characters without '/', '\\' or control characters`);
  }
  const mimeType = record.mimeType;
  if (typeof mimeType !== 'string' || !MIME_TYPE.test(mimeType)) {
    throw invalid('mimeType', "mimeType must be 'type/subtype' without parameters");
  }
  const size = record.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
    throw invalid('size', 'size must be a positive integer number of bytes');
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 'the file is over 25 MB', { details: { maxBytes: MAX_ATTACHMENT_BYTES, size } });
  }
  return { filename, mimeType, size };
}

/**
 * Reserves an upload for the user: the row first, then the signed URL for `{userId}/{id}`. If
 * signing fails the row is removed again, so no reservation exists without a way to upload.
 */
export async function reserveAttachment(deps: AttachmentDeps, userId: string, input: unknown): Promise<AttachmentUploadResponse> {
  const { filename, mimeType, size } = validateUpload(input);
  const id = (deps.newId ?? randomUUID)();
  const storagePath = `${userId}/${id}`;
  const row = await deps.attachments.create(userId, { id, filename, mimeType, size, storagePath });
  let upload;
  try {
    upload = await deps.attachmentStore.createUploadUrl(storagePath, mimeType);
  } catch (error) {
    deps.log?.('creating a signed upload URL failed', error);
    await deps.attachments.delete(userId, id).catch((cleanup: unknown) => deps.log?.('removing an unsigned attachment row failed', cleanup));
    throw new ApiError('INTERNAL', 'could not create the upload URL', {});
  }
  return {
    attachment: { attachmentId: row.id, filename: row.filename, mimeType: row.mimeType, size: row.size, createdAt: row.createdAt },
    upload: { url: upload.url, method: 'PUT', headers: upload.headers, expiresAt: upload.expiresAt.toISOString() },
  };
}
