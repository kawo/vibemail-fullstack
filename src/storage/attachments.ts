import type { SupabaseClient } from '@supabase/supabase-js';

/** The private Storage bucket for uploads (CONTRACT.md §5.5). */
export const ATTACHMENTS_BUCKET = 'attachments';

/** Supabase's signed upload URLs are valid for a fixed 2 hours. */
const SIGNED_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

export interface SignedUpload {
  url: string;
  /** Exactly the headers the browser must send with its PUT. Never a VibeMail or service token. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  content: Buffer;
  /** The object's stored content type; '' when Storage has none. */
  contentType: string;
}

/** Reads and signs objects in the `attachments` bucket with the service role. */
export interface AttachmentStore {
  createUploadUrl(path: string, contentType: string): Promise<SignedUpload>;
  /** Null when no object exists at `path` (reserved but not uploaded yet). */
  read(path: string): Promise<StoredObject | null>;
}

export class StorageError extends Error {
  readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    super(`storage error during ${operation}`);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

function isNotFound(error: unknown): boolean {
  const { status, statusCode, message } = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  return status === 404 || statusCode === '404' || (typeof message === 'string' && /not found/i.test(message));
}

export function createAttachmentStore(client: SupabaseClient, now: () => Date = () => new Date()): AttachmentStore {
  const bucket = () => client.storage.from(ATTACHMENTS_BUCKET);
  return {
    async createUploadUrl(path, contentType) {
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data) {
        throw new StorageError('createSignedUploadUrl', error);
      }
      return {
        url: data.signedUrl,
        headers: { 'content-type': contentType, 'x-upsert': 'false' },
        expiresAt: new Date(now().getTime() + SIGNED_UPLOAD_TTL_MS),
      };
    },

    async read(path) {
      const { data, error } = await bucket().download(path);
      if (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw new StorageError('download', error);
      }
      return { content: Buffer.from(await data.arrayBuffer()), contentType: data.type };
    },
  };
}
