/**
 * Drafts, shown in place of the message list when Drafts is chosen in the sidebar:
 *
 *   DraftsView   GET /api/v1/drafts (CONTRACT.md §4.13); loading, errors, empty, paging
 *   └─ DraftRow  one draft on the inbox row grid: recipients, saved time, subject — body, menu
 */
export { DraftsView } from './DraftsView';
