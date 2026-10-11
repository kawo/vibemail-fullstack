/**
 * The inbox view, split by responsibility:
 *
 *   InboxView        state: active chip, search, chip fill paging
 *   ├─ SearchBar      name, search field, refresh
 *   ├─ LabelFilterBar All · Starred · Archive · Trash · Label_…
 *   ├─ MessageList    skeletons, errors, empty states, paging rows, pull to refresh
 *   │  └─ MessageRow  one message: star, sender, time, subject — snippet, row menu, swipe
 *   └─ (SearchView, from components/search, replaces the filter bar and list while searching)
 *   ComposeButton     fixed bottom-right, rendered by App so it floats over every view
 */
export { InboxView } from './InboxView';
export { ComposeButton } from './ComposeButton';
export { MessageRow } from './MessageRow';
