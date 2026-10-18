import { handlers } from '../../../http';

/** PATCH and DELETE /api/v1/drafts/{draftId} — CONTRACT.md §4.11, §4.12 (bearer). */
export const PATCH = handlers.updateDraft;
export const DELETE = handlers.deleteDraft;
export const OPTIONS = handlers.options;
