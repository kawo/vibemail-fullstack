import { handlers } from '../../../http';

/** GET /api/v1/drafts — CONTRACT.md §4.13 (bearer): list the user's Gmail drafts. */
export const GET = handlers.listDrafts;
/** POST /api/v1/drafts — CONTRACT.md §4.10 (bearer): create a Gmail draft. */
export const POST = handlers.createDraft;
export const OPTIONS = handlers.options;
