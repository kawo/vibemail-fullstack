/**
 * The inbox view, split by responsibility:
 *
 *   InboxView        label fill paging; label and search come from InboxUiProvider
 *   ├─ SearchBar      menu button (phones), search field, clear, refresh
 *   ├─ list title     select-all box, the active label's name and the sync line
 *   ├─ SelectionBar   replaces the list title while selecting: count, bulk actions, clear
 *   ├─ MessageList    skeletons, errors, empty states, paging rows, pull to refresh
 *   │  └─ MessageRow  one message: checkbox, star, sender, time, subject — snippet, menu, swipe
 *   ├─ (DraftsView, from components/drafts, replaces the list when Drafts is chosen)
 *   └─ (SearchView, from components/search, replaces the filter bar and list while searching)
 *   ComposeButton     phones only: fixed bottom-right (Compose lives in the sidebar elsewhere)
 *
 * Labels and Compose are in components/sidebar.
 */
export { InboxView } from './InboxView';
export { ComposeButton } from './ComposeButton';
export { MessageRow } from './MessageRow';
