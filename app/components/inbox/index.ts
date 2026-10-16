/**
 * The inbox view, split by responsibility:
 *
 *   InboxView        label fill paging; label and search come from InboxUiProvider
 *   ├─ SearchBar      menu button (phones), search field with the ⌘K / Ctrl K shortcut, clear, refresh
 *   ├─ list title     select-all box, the active label's name and the sync line
 *   ├─ SelectionBar   replaces the list title while selecting: count, bulk actions, clear
 *   ├─ MessageList    skeletons, errors, empty states, paging rows, pull to refresh
 *   │  └─ MessageRow  (components/MessageRow.tsx, variant "list"; shared with search and threads)
 *   ├─ (DraftsView, from components/drafts, replaces the list when Drafts is chosen)
 *   └─ (SearchView, from components/search, replaces the filter bar and list while searching)
 *   ComposeButton     phones only: fixed bottom-right (Compose lives in the sidebar elsewhere)
 *
 * Labels (as chips) and Compose are in components/sidebar.
 */
export { InboxView } from '@/app/components/inbox/InboxView';
export { ComposeButton } from '@/app/components/inbox/ComposeButton';
