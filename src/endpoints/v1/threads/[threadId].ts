import { handlers } from '../../../http';

/** GET /api/v1/threads/{threadId} — CONTRACT.md §4.8 (bearer): stored messages of one thread, DB only. */
export const GET = handlers.getThread;
export const OPTIONS = handlers.options;
