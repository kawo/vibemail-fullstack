import { handlers } from '../../../http';

/** GET /api/v1/messages/search — CONTRACT.md §4.9 (bearer): search stored messages, DB only. */
export const GET = handlers.searchMessages;
export const OPTIONS = handlers.options;
