/**
 * Search, shown in place of the inbox's filter bar and list while a query of 2+ characters is
 * typed in the inbox's SearchBar:
 *
 *   SearchView          GET /api/v1/messages/search; debounce, paging, loading and errors
 *   └─ SearchResultList inbox rows with highlighted terms and status badges, or no results
 */
export { SearchView } from '@/components/search/SearchView';
