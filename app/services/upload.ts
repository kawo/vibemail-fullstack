import { ApiError } from './errors';
import type { AttachmentUploadResponse } from './types';

/**
 * Sends a file to the signed Storage URL from `POST /api/v1/attachments` (CONTRACT.md §4.14):
 * the raw bytes, exactly `upload.headers`, and never the VibeMail session token, since the request
 * goes to Supabase Storage, not to this API. Any non-2xx answer (too large, expired or reused URL)
 * rejects with a retryable `INTERNAL` ApiError; the caller reserves again on Retry.
 */
export async function uploadToStorage(upload: AttachmentUploadResponse['upload'], file: Blob, signal?: AbortSignal): Promise<void> {
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file,
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new ApiError(response.status, { code: 'INTERNAL', message: `upload failed with ${response.status}`, retryable: true });
  }
}
