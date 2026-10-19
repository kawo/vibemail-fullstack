import type { MessagesRepository } from '../db/messages';
import type { UsersRepository } from '../db/users';
import { ApiError } from '../middleware/errors';
import { type MailProviderFactory, ProviderError } from '../providers/provider';
import { apiErrorFromProvider, providerForUser } from '../services/gmailAccount';
import type { AttachmentStore } from '../storage/attachments';
import { MAX_ATTACHMENT_BYTES } from './index';

/**
 * Attachment download, CONTRACT.md §4.15: a signed Storage URL for one attachment of a stored
 * message. The file is read from Gmail once, on request, and kept in the bucket at
 * `{userId}/received/{gmailId}/{partId}`, because a function can't return more than 4.5 MB.
 */

export interface DownloadDeps {
  factory: MailProviderFactory;
  users: UsersRepository;
  messages: MessagesRepository;
  attachmentStore: AttachmentStore;
}

export interface AttachmentDownloadResponse {
  url: string;
  expiresAt: string;
  filename: string;
  mimeType: string;
  size: number;
}

const GMAIL_ID = /^[A-Za-z0-9]+$/;
/** Gmail MIME part IDs: digits separated by dots, e.g. `1` or `0.2`. */
const PART_ID = /^\d+(\.\d+)*$/;

const invalid = (field: string, message: string) =>
  new ApiError('VALIDATION_FAILED', 'invalid attachment request', { details: { issues: [{ field, message }] } });

export async function downloadAttachment(
  deps: DownloadDeps,
  userId: string,
  gmailId: string,
  partId: string,
): Promise<AttachmentDownloadResponse> {
  if (!GMAIL_ID.test(gmailId)) {
    throw invalid('id', 'must be a Gmail message ID');
  }
  if (!PART_ID.test(partId)) {
    throw invalid('partId', 'must be an attachment part ID');
  }
  // Only the user's own stored message, and only an attachment it lists (§5.3).
  const message = await deps.messages.getMessage(userId, gmailId);
  if (!message) {
    throw new ApiError('MESSAGE_NOT_FOUND', 'message not found');
  }
  const meta = message.attachments.find((a) => a.partId === partId);
  if (!meta) {
    throw new ApiError('MESSAGE_NOT_FOUND', 'attachment not found', { details: { partId } });
  }
  if (meta.size > MAX_ATTACHMENT_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 'the attachment is over 25 MB', {
      details: { maxBytes: MAX_ATTACHMENT_BYTES, size: meta.size },
    });
  }

  // Built from the token's sub and the validated, stored IDs only.
  const path = `${userId}/received/${message.gmail_id}/${meta.partId}`;
  let signed = await deps.attachmentStore.createDownloadUrl(path, meta.filename);
  if (!signed) {
    const provider = await providerForUser(deps, userId);
    let content: Buffer;
    try {
      content = await provider.getAttachment(message.gmail_id, meta.partId);
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.kind === 'revoked') {
          await deps.users.clearUserTokens(userId);
        }
        if (error.kind === 'not_found') {
          throw new ApiError('MESSAGE_NOT_FOUND', 'attachment no longer in Gmail', { details: { partId } });
        }
        throw apiErrorFromProvider(error);
      }
      throw error;
    }
    await deps.attachmentStore.put(path, content, meta.mimeType);
    signed = await deps.attachmentStore.createDownloadUrl(path, meta.filename);
    if (!signed) {
      throw new ApiError('INTERNAL', 'the stored copy is missing');
    }
  }
  return {
    url: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
    filename: meta.filename,
    mimeType: meta.mimeType,
    size: meta.size,
  };
}
