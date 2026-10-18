import { handlers } from '../../../http';

/** PATCH /api/v1/messages/{id} — CONTRACT.md §4.7 (bearer): change one message's labels. */
export const PATCH = handlers.updateLabels;
export const OPTIONS = handlers.options;
