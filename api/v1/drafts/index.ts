import { handlers } from '../../../src/http';

/** POST /api/v1/drafts — CONTRACT.md §4.10 (bearer): create a Gmail draft. */
export const POST = handlers.createDraft;
export const OPTIONS = handlers.options;
