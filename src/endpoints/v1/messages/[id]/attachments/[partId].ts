import { handlers } from '../../../../../http';

/** GET /api/v1/messages/{id}/attachments/{partId} — CONTRACT.md §4.15 (bearer): a signed download URL. */
export const GET = handlers.downloadAttachment;
export const OPTIONS = handlers.options;
