import { handlers } from '../../../http';

/** POST /api/v1/attachments — CONTRACT.md §4.14 (bearer): reserve an upload and sign its Storage URL. */
export const POST = handlers.reserveAttachment;
export const OPTIONS = handlers.options;
