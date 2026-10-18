# VibeMail Glass — Frontend Behavioural Spec

This spec describes how each VibeMail Glass view behaves. It relies on [`CONTRACT.md`](../CONTRACT.md):

- **Fields** are the `MessageDTO` names (§3.4) and `DraftDTO` names (§3.7).
- **Error states** use the `error.code` values defined in §3.3 and listed in each endpoint's table in §4.
- **Endpoints** are the exact paths in §4. Paths marked *v1.1* are contracted but not yet implemented in the backend.

## Shared rules

- **Authentication.** Every request carries `Authorization: Bearer <Supabase access token>`.
  - On `UNAUTHENTICATED`, the app first tries one silent Supabase session refresh and repeats the request once.
  - If the refresh fails, it signs the user out and shows the sign-in screen.
  - Sign-in is a full-page navigation to `GET /api/v1/auth/google`.
- **Reconnect.** `GMAIL_NOT_CONNECTED` and `GMAIL_TOKEN_REVOKED` always show the same glass panel: "Reconnect Gmail", with a button that navigates to `GET /api/v1/auth/google`. Any unsent compose content is kept locally first.
- **Rate limits.** On `GMAIL_RATE_LIMITED`, the app reads the `Retry-After` header and disables the failed action for that many seconds, with a countdown. It never retries automatically more than once.
- **Retrying.** The app shows a retry button only when the envelope's `retryable` is `true`, or the code is `INTERNAL`.
- **`status` is never set by the frontend.**
  - The server derives `status` from `labelIds` at write time (CONTRACT.md §3.4).
  - The frontend never sends `status` in any request body, and never computes a new `status` itself.
  - It changes labels with `PATCH /api/v1/messages/{id}`, then takes `status` from the returned `message`.
- **`draftId` is server-managed.**
  - Gmail assigns it, and the client receives it only in a `DraftDTO` returned by `POST /api/v1/drafts`, `PATCH /api/v1/drafts/{draftId}` or `GET /api/v1/drafts` (§4.13, *v1.1*).
  - The client never supplies a `draftId` in a request body and never generates one. It only echoes a received `draftId` back in the path of `PATCH /api/v1/drafts/{draftId}` and `DELETE /api/v1/drafts/{draftId}`.
- **One message cache.** All views share one client-side cache of `MessageDTO`s keyed by `gmailId`. Any response that returns a `message` replaces the cached entry, so every view shows the server's latest `labelIds`, `status`, `isRead` and `isStarred`.
- **Stored mail only.** The list, thread view and search show only the messages the backend has stored, never the whole Gmail mailbox. These are the 50 newest INBOX messages at connect time, plus every later change pushed by Gmail.
- **Keyboard.** Every control is reachable with Tab, in reading order (sidebar, header, list), and shows a visible focus indicator when focused from the keyboard. A control that is hidden at rest (a row's unstarred star) appears at full strength when it takes keyboard focus, as on hover. A control that disappears when used (the search field's clear button) leaves focus on the field it belongs to.
- **Touch targets.** On touch screens every tappable area is at least 44 × 44px. Standalone buttons, chips, header and drawer controls, and input fields grow to 44px. Small controls inside rows, cards and fields (checkboxes, stars, a row's menu, close and clear buttons, recipient pills, the Settings options) keep their visible size and gain an invisible hit area, centred on them, that reaches 44px.

---

## 1. Inbox

Primary endpoints:
- `GET /api/v1/messages` (§4.2);
- `POST /api/v1/messages/{id}/read` (§4.4);
- `PATCH /api/v1/messages/{id}` (§4.7, *v1.1*).

### Default state

- **Layout.** A vertical list of glass rows, newest first, as the server orders them (`internalDate` descending). The labels are chips in the sidebar on the left (see Label sidebar below), with **All** active; the list is headed by the active chip's name.
- **Row content.** Each row shows:
  - `fromAddress`, display name only when the raw value has the form `Name <addr>`;
  - `subject` (or "(no subject)" when `null`);
  - `snippet`;
  - `internalDate`, as a relative time;
  - a star icon reflecting `isStarred`;
  - a paperclip icon when `attachments` is non-empty.
- **Unread rows.** When `isRead` is `false`, the row has bold `fromAddress` and `subject` and an 8px accent dot with a soft accent glow, just right of the relative time. Read rows show no dot. The row's accessible name ends with ", unread".
- **Header.** Shows "Synced {relative time}" from the response's `lastSyncedAt`, or "Syncing your mailbox…" when `lastSyncedAt` is `null`.
- **Page size.** The first page is requested with `limit=25` and no `cursor`.

### User actions

- **Open a message:** tap a row.
  - If `isRead` is `false`, the app calls `POST /api/v1/messages/{id}/read` with the row's `gmailId`, without waiting for it.
  - It then navigates to the thread view for the row's `threadId`.
- **Star / unstar:** tap the star icon.
  - The app sends `PATCH /api/v1/messages/{id}` with `{ addLabelIds: ['STARRED'] }` or `{ removeLabelIds: ['STARRED'] }`.
  - The icon toggles immediately. The row is then replaced by the returned `message`, and the icon reverts if the call fails.
- **Mark unread:** swipe or use the row menu. The app sends `PATCH /api/v1/messages/{id}` with `{ addLabelIds: ['UNREAD'] }`.
- **Archive:** swipe left or use the row menu.
  - The app sends `PATCH /api/v1/messages/{id}` with `{ removeLabelIds: ['INBOX'] }`.
  - The row dims while the request is pending. It leaves the current chip's results only once the returned `status` no longer matches that chip.
- **Move to trash:** use the row menu. The app sends `PATCH /api/v1/messages/{id}` with `{ addLabelIds: ['TRASH'] }`. The row behaves as for archive.
- **Restore** (only under the Trash chip): the app sends `PATCH /api/v1/messages/{id}` with `{ removeLabelIds: ['TRASH'] }`.
- **Undo:** archive, trash and restore show a toast with an Undo button for 5 seconds. Undo sends the inverse `PATCH`.
- **Load more:** when the user scrolls within one screen of the end, the app requests `GET /api/v1/messages` with the last `nextCursor`. This stops when `nextCursor` is `null`.
- **Refresh:** pull to refresh, or the refresh button, reloads from the first page with no `cursor`. The refresh never calls Gmail; it only re-reads what push has stored.
- **Compose:** the **Compose** button at the top of the sidebar, or on phones the floating button fixed at the bottom-right corner (16px from the right edge, 24px plus the safe-area inset from the bottom), opens the compose drawer in its default state. The floating button is hidden while the drawer is open.
- **Search:** focusing the search field starts the search view (§5).

### Selection

Several messages can be marked unread or read, archived, trashed or restored at once. The contract has no batch endpoint (CONTRACT.md §1 out of scope), so a bulk action sends one `PATCH /api/v1/messages/{id}` per message, one at a time, as archiving a conversation does (§2).

- **Checkbox.** Each inbox and search row leads with a checkbox. With a pointer it shows when the row is hovered or focused, and on every row while anything is selected. On touch screens its column appears only while selecting.
- **Selecting.**
  - Click the checkbox, Ctrl/⌘-click the row, or focus the row and press Space.
  - Shift extends the selection from the last message toggled, in list order.
  - On touch screens, a long press (450 ms) selects the row; the browser's own long-press menu is suppressed.
  - The list header's checkbox selects every listed message (only those loaded so far).
  - While anything is selected, tapping a row or pressing Enter toggles it instead of opening it, and swipe-to-archive is off.
  - Selected rows take the active label's tint over selected glass.
- **Selection bar.** While anything is selected, a glass-3 bar replaces the list header (or the result count in search) and sticks under the search bar. It shows the select-all checkbox (mixed when some are selected), "{n} selected", the actions and a close `x`.
  - **Mark unread / Mark read** is one toggle, like the thread header's. While any selected message is read it reads **Mark unread** (`ring` icon) and sends `{ addLabelIds: ['UNREAD'] }` for the read ones. Once every selected message is unread it reads **Mark read** (the accent `dot`, pressed) and calls `POST /api/v1/messages/{id}/read` for each. Both keep the selection, so clicking again undoes it.
  - **Archive** applies to those whose `status` is `inbox`: `{ removeLabelIds: ['INBOX'] }`.
  - **Trash** (in `danger-text`) applies to those not in the trash: `{ addLabelIds: ['TRASH'] }`. It is hidden when every selected message is trashed.
  - **Restore** (`inbox` icon) applies to those in the trash: `{ removeLabelIds: ['TRASH'] }`. It is shown only when a selected message is trashed.
  - An action with nothing to apply to is disabled. When the list pane is too narrow for their words (under 490px with three actions, under 590px with four), the actions show as icons, each keeping its name as its label and tooltip, so none runs under the close `x`.
- **Running.** Archive, Trash and Restore clear the selection; every affected row dims at once, and each row is replaced by its returned `message` as it completes. Marking unread or read shows the rows' new state straight away.
- **Result.** One toast sums it up: "3 messages archived", or "2 of 3 messages archived. Couldn't update the rest." Archive, trash and restore offer Undo for 5 seconds, which sends the inverse change for the messages that succeeded.
- **Errors.**
  - `MESSAGE_NOT_FOUND` drops that message from the cache, and the toast says "The rest no longer exist."
  - `GMAIL_RATE_LIMITED` stops the rest: "Gmail is busy, try again in {n}s. 2 of 5 messages archived."
  - `UNAUTHENTICATED`, `GMAIL_NOT_CONNECTED` and `GMAIL_TOKEN_REVOKED` stop the rest and follow the shared rules.
- **Clearing.** The close `x`, Escape (unless the compose drawer is open), a click or tap anywhere outside the rows and the selection bar (the reading pane, the sidebar, the search field, the empty space below the list), choosing a label, changing or ending a search, and Archive, Trash or Restore clear the selection. Clicks on a toast, a menu or the compose drawer keep it, and a scroll that starts outside never clears it.

### Loading state

- **First load:** eight glass skeleton rows, with a shimmer that sweeps across the frosted surface. The sidebar renders immediately.
- **Loading more:** a small spinner row at the end of the list. Existing rows stay interactive.
- **Refresh:** a pull indicator at the top. The current rows stay visible until the new first page replaces them.
- **Pending action:** a row with a `PATCH` in flight is dimmed to 60% and ignores further swipes until the request settles.

### Error states

For `GET /api/v1/messages`:
- `UNAUTHENTICATED`: shared rule.
- `GMAIL_NOT_CONNECTED`: the list is replaced by the reconnect panel.
- `VALIDATION_FAILED`: a stale or corrupt `cursor`. The app silently drops the cursor and reloads from the first page.
- `INTERNAL`: on a first load, a centred glass panel "Couldn't load your mail" with Retry. When loading more, an inline "Couldn't load more · Retry" row at the end of the list.

For `POST /api/v1/messages/{id}/read` and `PATCH /api/v1/messages/{id}`:
- `UNAUTHENTICATED`: shared rule.
- `GMAIL_NOT_CONNECTED`, `GMAIL_TOKEN_REVOKED`: the optimistic change is reverted and the reconnect panel opens.
- `VALIDATION_FAILED`: the change is reverted, with a toast "That change isn't allowed".
- `MESSAGE_NOT_FOUND`: the row is removed from the cache, with a toast "This message no longer exists".
- `GMAIL_RATE_LIMITED`: the change is reverted, with a toast "Gmail is busy, try again in {Retry-After}s". Until then every message action (star, mark read or unread, archive, trash, restore, alone or in bulk) is refused without a request, with the same toast counting the seconds left.
- `GMAIL_UPSTREAM_ERROR`, `INTERNAL`: the change is reverted, with a toast "Couldn't update the message" and Retry.

### Empty state

- **Nothing stored yet** (`messages` is empty and `lastSyncedAt` is `null`): a frosted illustration with "Your mailbox is syncing. New mail will appear here as it arrives." There is no refresh prompt, because push fills the list.
- **Nothing in the inbox** (`messages` is empty and `lastSyncedAt` is set): "You're all caught up", with the "Synced {relative time}" line.
- **Empty chip:** an active chip with no matching messages shows that chip's empty state (§4).

### Label sidebar

- **Placement.** From 768px wide, a sidebar on the left holds, top to bottom: the product name, the full-width **Compose** button, the labels as chips (§4), and the account foot. It stays in place while the inbox and threads change beside it. Its right edge resizes it (184–360px; arrow keys when focused; double-click resets), and a toggle in its header collapses it to icons only (56px; names become tooltips, custom labels show a short id like `#12`). Width and mode are remembered on the device. On narrower screens it is a panel that slides in from the left, opened from a menu button in the header; choosing a chip or Compose, tapping outside, or Escape closes it. Phones also keep a floating Compose button. Collapsed to icons only, Compose becomes a 40px icon button with its name as tooltip.
- **Chips.** Every label is a chip, one per line and the sidebar's full width: a glass pill (`surface-soft` fill, 1px `glass-edge` border, 4px radius) with its icon, name and count. On touch screens each chip is at least 44px tall. Collapsed to icons only, the chips become 40px icon buttons.
- **Counts.** Every chip shows a right-aligned count of its new mail; a zero shows nothing. Collapsed, the count is a small badge on the icon and joins the tooltip (`Starred · 3`).
  - **All, Starred, Archive, Trash and custom labels:** how many loaded messages (whichever list, search or thread loaded them) meet the label's rule (§4) and are unread (`isRead` is `false`), in bold `ink`, the way unread rows read. Opening or marking a message read lowers every count it was in; marking it unread raises them.
  - **Drafts:** drafts have no unread state, so it counts the drafts listed (§4 Drafts), in `mute`, with a `+` (`25+`) while the list has more pages.
  - Message counts cover only mail VibeMail has synced and loaded (the contract has no count endpoint), so they can grow as the list pages.
- **Fixed labels.** The sidebar always shows five fixed label chips, in this order: **All**, **Starred**, **Archive**, **Trash**, **Drafts**. They are present even when they match nothing. Drafts is not a filter: it shows the draft list (§4 Drafts).
- **Custom labels.** Custom Gmail labels follow under a "Labels" heading, one chip per distinct `labelIds` entry starting with `Label_` across the loaded messages, sorted alphabetically. They appear and disappear as loaded messages change.
  - The contract has no label-name endpoint, so a custom label shows the label ID.
- **Selection.** Exactly one chip or label is active at a time. The active one has the brightest glass fill and a 1px accent border.
- **Overflow.** The sidebar scrolls vertically when the labels overflow. The chips and Drafts stay first and are never collapsed into a menu.
- **From a thread or a search.** Choosing a label returns to the inbox list on that label, ending any search.
- **Filtering.** Chip behaviour, matching rules and states are specified in §4 (Label filter).

### Account and Settings

- **Account.** The foot of the sidebar shows the signed-in account's email (the Supabase session's `user.email`), after an initial in an avatar, truncated with the full address as a tooltip. Icons only, just the initial shows, with the email as its tooltip.
- **Settings.** Under the email, a **Settings** button (`sliders` icon) opens a raised-glass Settings panel above the account block (beside the button when the sidebar shows icons only; inside the panel on phones, so it stays within that dialog). It holds two radio groups, Keyboard shortcuts and Sign out:
  - **Appearance:** Dark (the default), Light, or System, which follows the device's light or dark setting as it changes.
  - **Text size:** Small, Default, Large, Larger, each shown as an "A" at that size. Every font size and line height scales with it (0.9, 1, 1.12, 1.25); spacing and icons keep their size.
  - **Keyboard shortcuts:** a full-width secondary button (`keyboard` icon) under the two groups. It closes Settings and opens the shortcuts list: a modal raised-glass panel over a scrim, above the phone's sidebar panel, titled "Keyboard shortcuts". It lists every shortcut the app supports, grouped by where it works (Anywhere, Message list, Conversation, Compose, Sidebar), each as its action and its keys as key caps, with alternatives joined by "or". The modifier reads ⌘ on Apple devices and Ctrl elsewhere. The list scrolls inside the panel when taller than the screen; on phones each shortcut's keys sit under its name. Like the compose drawer it is modal (the app behind is inert, Tab wraps inside it). Escape, its close button or a click on the scrim closes it, and focus returns to the Settings button.
  - **Sign out:** a full-width secondary button under Keyboard shortcuts. It ends the session (the Supabase session; in sample mode, the local stand-in), clears the cached mail, and returns to the sign-in page. While it runs it reads "Signing out…" and is disabled; if it fails, it is enabled again and a toast reads "Couldn't sign out. Try again."
- The panel is raised glass with square corners, like every raised surface, and shares the compose drawer's denser tint (§3), so its text reads cleanly over whatever is behind it.
- A change applies at once and is kept on the device; it is applied before the first paint, so the page never flashes the other theme. Escape, a click outside, or the button again closes the panel, and focus returns to the button.
- **Light theme.** The same glass over a pale blue-grey ground: white glass rising toward white, navy hairlines and shadows, near-black text, a dark primary button. The accent keeps its one value. Every text token keeps 4.5:1 on its grounds, as in dark; the star keeps 3:1 as an icon, so words in warning (Not saved) use a darker `warning-text`.

---

## 2. Thread view

Primary endpoint: `GET /api/v1/threads/{threadId}` (§4.8, *v1.1*). It also uses:
- `POST /api/v1/messages/{id}/read` (§4.4);
- `PATCH /api/v1/messages/{id}` (§4.7);
- the compose drawer (§3).

### Default state

- **Placement.** From 1100px wide, the thread opens in a reading pane beside the message list, and the opened row stays highlighted; the header's close control empties the pane. Narrower, the thread replaces the list, sliding in from the right, with a back control.
- **Header.** The `subject` of the oldest message in `messages` (or "(no subject)"), with a back control to the inbox. On the right, icon controls, each with its name as label and tooltip: the read toggle (`ring` when read, the accent `dot` when unread: "Mark as unread" / "Mark as read"), the conversation star, **View in Gmail** (`external`; a link that opens `https://mail.google.com/mail/?authuser={account email}#all/{threadId}` in a new tab, with `rel="noopener noreferrer"`), the **Plain | HTML** switch (see Message cards), **Archive conversation** (`archive`; disabled when no message in it is in the inbox) and **Move conversation to trash** (`trash`, `danger-text` on hover). Opened from the Trash label, or when every message in it is trashed, the last button is **Restore conversation to the inbox** (`inbox`) instead. While one runs, a spinner leads them and they are disabled.
- **Message cards.** One glass card per message, oldest first. The newest message is expanded and the earlier ones are collapsed.
  - **Sender:** the display name of `fromAddress` ("You" on sent cards), then its bare address in brackets, quieter (`mute`, 12px): "Lena Ortiz (lena@northwind.example)". The brackets are left out when the name already is the address. A sender line too long for the card ends in an ellipsis, with the address in a tooltip.
  - **Collapsed card:** `fromAddress`, `snippet` and `internalDate`.
  - **Expanded card header:** `fromAddress`, `toAddress`, `ccAddresses` (when non-empty) and `internalDate`.
  - **Expanded card body:** by default `bodyPlain` when it has text, otherwise `bodyHtml`, otherwise `snippet`. Blank or whitespace-only text counts as none.
    - **Plain | HTML switch.** A two-option segmented control in the header ("Message format") picks the format of the *current message*: the most recently expanded card that is still open (at first the newest). It shows that message's format: Plain for `bodyPlain` (or `snippet` when there is no plain text), HTML for the sandboxed `bodyHtml`. HTML is disabled when the message's `bodyHtml` is `null` or blank; both options are disabled when no card is open. The pick is kept per message and resets when another thread opens.
    - `bodyPlain` is rendered with line breaks preserved.
    - `bodyHtml` is sanitised and rendered in a frame with `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`: no scripts run, links open in a new tab, and remote images stay blocked until the user allows them.
- **Status badges.** A card whose `status` is `trash`, `spam` or `archived` shows a small badge with that value. A card whose `status` is `sent` is aligned to the right.
- **Attachments.** Each entry in `attachments` is listed by `filename`, `mimeType` and `size`. The list is informational only: the contract has no attachment download endpoint.
- **Truncated threads.** When `truncated` is `true`, a frosted banner above the first card reads "Earlier messages in this conversation aren't available in VibeMail".

### User actions

- **Expand or collapse:** tap a card. Expanding a card whose `isRead` is `false` calls `POST /api/v1/messages/{id}/read` for its `gmailId`.
- **Reply:** the reply button on any expanded card opens the compose drawer in reply mode for that message (§3).
- **Star / unstar:** a per-card star, as in the inbox, through `PATCH /api/v1/messages/{id}`.
- **Archive the conversation:** sends `PATCH /api/v1/messages/{id}` with `{ removeLabelIds: ['INBOX'] }` for every card whose `status` is `inbox`, one request at a time. When all have settled, the app returns to the inbox.
- **Trash the conversation:** sends `{ addLabelIds: ['TRASH'] }` for every card whose `status` is not `trash`, one at a time, then returns to the inbox.
- **Restore the conversation** (in place of trash, as above): sends `{ removeLabelIds: ['TRASH'] }` for every card whose `status` is `trash`, one at a time, toasts "Conversation restored to the inbox" and returns to the list. The server derives each restored message's new `status`.
- **Back:** returns to the inbox with its scroll position and active chip preserved.

### Loading state

The header shows a skeleton title bar and three skeleton cards; the back control works immediately. When the user opens the thread from the inbox, the tapped row's cached `subject` and `snippet` appear in the skeleton straight away.

### Error states

For `GET /api/v1/threads/{threadId}`:
- `UNAUTHENTICATED`: shared rule.
- `GMAIL_NOT_CONNECTED`: reconnect panel.
- `VALIDATION_FAILED`: a malformed `threadId`, for example from an edited deep link. The panel reads "This conversation link isn't valid", with Back to inbox.
- `MESSAGE_NOT_FOUND`: no stored message in this thread. The panel reads "This conversation isn't available", with Back to inbox. This is an error, not an empty state.
- `INTERNAL`: a panel "Couldn't load this conversation", with Retry.

Per-card actions surface the same error states as the inbox's `POST /api/v1/messages/{id}/read` and `PATCH /api/v1/messages/{id}` (§1). A failure while archiving or trashing the conversation stops the loop, keeps the user in the thread, and reports how many messages were changed.

---

## 3. Compose drawer

Primary endpoints:
- `POST /api/v1/messages/send` (§4.3);
- `POST /api/v1/drafts` (§4.10, *v1.1*);
- `PATCH /api/v1/drafts/{draftId}` (§4.11, *v1.1*);
- `DELETE /api/v1/drafts/{draftId}` (§4.12, *v1.1*).

The drawer edits the request fields `to`, `subject`, `body` and `threadId` (§4.3, §3.7). It holds at most one `draftId`, which it received from the server.

The drawer is a modal dialog. While it is open the app behind it is inert (no clicks, no keyboard focus, hidden from screen readers), and Tab and Shift+Tab wrap around the drawer's own controls. Closing it, by any route, returns focus to the control that opened it (the Compose button, Reply, or a draft in the list).

### Default state

- **Opening.** The drawer slides up from the bottom (mobile) or the bottom-right corner (desktop) as a heavy glass sheet.
- **Fields.** `to` is a recipient-chip field, focused on open. `subject` is a single line. `body` is a multi-line plain-text area. There is no `threadId`.
- **Header.** A drag handle, a close control, and the Send button.
- **Initial state.** No draft exists yet, so the drawer holds no `draftId`. Send is disabled until `to` has at least one valid address.

### Reply mode

- **Opening.** The reply action in the thread view opens the drawer with `threadId` set to the replied message's `threadId`.
- **Prefilled fields:**
  - `to`: the replied message's `fromAddress`;
  - `subject`: the replied message's `subject`, prefixed with "Re: " unless it already starts with "Re:" (case-insensitive). The server passes `subject` through unchanged, so this prefix is what lets recipients' mail clients thread the reply;
  - `body`: an empty line, then "On {dateHeader or internalDate}, {fromAddress} wrote:", then the replied message's `bodyPlain` (or `snippet` when `bodyPlain` is `null`) with each line prefixed by "> ".
- **Header.** A pill reads "Replying in conversation". Removing the pill clears `threadId` and turns the drawer into the default state, keeping the field contents.
- **Focus.** It starts at the top of `body`.

### Draft-restored state

- **When.** When the drawer opens, the client finds the snapshot of the last successful `DraftDTO` it received, kept in local storage, and the user has neither sent nor discarded that draft. **Compose** always means a new message: it restores the snapshot only when that snapshot is a new message. A snapshot of a reply is left saved (it stays in Drafts), and Compose opens the default state.
- **What it shows.**
  - `to`, `subject`, `body` and `threadId` are filled from the snapshot.
  - The drawer keeps the snapshot's `draftId` for the next save.
  - A banner reads "Draft restored · saved {updatedAt as relative time}".
  - If `threadId` is set, the reply pill is shown as in reply mode.
- **Choices.** The banner offers Discard, which deletes the draft as described under User actions. Any edit dismisses the banner.
- **Limit.** Restore works only on the device that saved the draft. Drafts saved elsewhere are reached through Drafts (§4), which opens them as below.
- **Precedence.** Opening a reply while a draft snapshot exists asks "Replace your saved draft?" before entering reply mode.
- **Opened from Drafts.** Opening a listed draft (§4 Drafts) shows the same state, filled from that `DraftDTO`: the drawer keeps its `draftId`, and the banner reads "Draft · saved {updatedAt as relative time}". The caret goes to the end of the text.
  - Gmail gives every draft a `threadId`, so it opens as a reply only when it is this device's snapshot of a reply, or when a loaded message has its `threadId`. Otherwise it opens as a new message.
  - Saving, sending and discarding keep the Drafts list and count current: a saved draft moves to the top, a sent or discarded one leaves.

### User actions

- **Edit:** any change to `to`, `subject` or `body` starts a 2-second autosave debounce.
- **Autosave.** The app keeps at most one draft request in flight; further changes queue a single follow-up save.
  - **First save:** when the drawer holds no `draftId`, the app calls `POST /api/v1/drafts` with `{ to, subject, body, threadId? }`. It stores the returned `DraftDTO` (including the server-assigned `draftId`) in drawer state and in the local-storage snapshot.
  - **Later saves:** the app calls `PATCH /api/v1/drafts/{draftId}` with the full current `{ to, subject, body, threadId? }`, because the update replaces the whole draft. It replaces the snapshot with the returned `DraftDTO`.
  - **Indicator:** a quiet "Saved" or "Saving…" label in the header.
- **Send:** tap Send, or Ctrl/Cmd+Enter.
  1. The app validates on the client, using the same rules as CONTRACT.md §4.3: every recipient is a valid address, at most 100 recipients, and `subject` has no line breaks and at most 998 characters.
  2. It calls `POST /api/v1/messages/send` with `{ to, subject, body, threadId? }`.
  3. On `201`, it inserts the returned `message` into the cache and closes the drawer with a toast "Sent". If a `draftId` is held, it then calls `DELETE /api/v1/drafts/{draftId}` in the background and clears the snapshot whatever the outcome.
- **Close:** the drawer closes, but the draft and snapshot are kept. A pending autosave fires immediately.
- **Discard:** after a confirmation ("Discard draft?"), if a `draftId` is held, the app calls `DELETE /api/v1/drafts/{draftId}`. It clears the snapshot and closes the drawer.
- **Expand:** desktop only. Expanding enlarges the drawer to a centred glass modal; collapsing restores it.

### Loading state

- **Sending:**
  - the Send button shows a spinner;
  - all fields become read-only;
  - close and discard are disabled until the request settles.
- **Saving a draft:** the header shows "Saving…". Editing continues normally.

### Error states

For `POST /api/v1/messages/send`:
- `UNAUTHENTICATED`: shared rule. The drawer content stays intact and the send is retried after re-authentication.
- `GMAIL_NOT_CONNECTED`, `GMAIL_TOKEN_REVOKED`: the drawer stays open with its content saved to the local snapshot, and the reconnect panel opens.
- `VALIDATION_FAILED`: each entry in `details.issues` is shown inline under its field (`to`, `subject`, `body` or `threadId`).
- `MESSAGE_NOT_FOUND`: the `threadId` no longer exists. An inline prompt reads "This conversation no longer exists. Send as a new message?", and confirming clears `threadId` and retries.
- `GMAIL_RATE_LIMITED`: the drawer stays open, and Send is disabled with a `Retry-After` countdown.
- `GMAIL_UPSTREAM_ERROR`, `INTERNAL`:
  - **with `details.sentGmailId`:** the message *was* sent. The drawer closes with "Sent. It may take a moment to appear", and it must never be resent;
  - **without it:** an inline banner "Couldn't send" with Retry, and the content stays in place.

For `POST /api/v1/drafts` and `PATCH /api/v1/drafts/{draftId}`:
- **Failures are quiet.** The header label changes to "Not saved", and the next edit or a 10-second timer retries.
- `MESSAGE_NOT_FOUND` on `PATCH /api/v1/drafts/{draftId}`: the draft was deleted elsewhere. The app drops the held `draftId` and the next save uses `POST /api/v1/drafts`.
- `MESSAGE_NOT_FOUND` on `POST /api/v1/drafts`: the `threadId` is unknown. The app shows the same prompt as for send.
- `GMAIL_NOT_CONNECTED`, `GMAIL_TOKEN_REVOKED`: the app stops autosaving and keeps the local snapshot. The reconnect panel is deferred until the user tries to send.
- `GMAIL_RATE_LIMITED`: the next autosave is postponed by `Retry-After` seconds.

For `DELETE /api/v1/drafts/{draftId}`:
- `MESSAGE_NOT_FOUND`: treated as success.
- Any other code after a send: logged only. The sent message matters more than a leftover Gmail draft.
- Any other code on Discard: a toast "Couldn't delete the draft in Gmail". The drawer closes anyway.

### Empty state

- **No draft from a blank drawer.** A drawer in which `to`, `subject` and `body` are all empty, and which holds no `threadId`, never creates a draft.
- **Closing it.** Closing such a drawer makes no server call and leaves no snapshot.
- **Emptying a draft.** If a drawer that holds a `draftId` is cleared to that same blank state, closing it behaves as Discard, without the confirmation.

### Mobile keyboard behaviour

- **Height cap.** The drawer's height never exceeds **58% of the viewport height** (`58dvh`), whether or not the keyboard is open.
- **Position.** When the software keyboard opens, the drawer moves up to sit directly on top of the keyboard. Its position follows `window.visualViewport`, so it is never covered.
- **Small screens.** If the space above the keyboard is less than 58% of the viewport, the drawer shrinks to that space and never extends behind the keyboard.
- **What stays visible:**
  - the header, with Send, is pinned at the top of the drawer and never scrolls out of view;
  - `to` and `subject` keep their full height;
  - `body` takes the remaining height and scrolls internally;
  - the focused field's caret is kept scrolled into view.
- **Background.** The page behind the drawer does not scroll while the drawer is open; the inbox behind it is dimmed and blurred.
- **When the keyboard closes,** the drawer returns to its resting height, which is also capped at 58% of the viewport height, without jumping. Its height animates over 200–250 ms.

---

## 4. Label filter

Server-side: each label is a list of its own, fetched and paged with `GET /api/v1/messages?label=…` (CONTRACT.md §4.2, *changed in v1.2*). The `label` value is the chip's kind (`all`, `starred`, `archive`, `trash`) or the custom label's ID. The frontend reads `status` but never sets it.

### Default state

**All** is active. Every label is a chip in the sidebar, one per line (§1 Label sidebar). The server returns, for each, the messages where:

| Chip | Shows messages where |
|---|---|
| **All** | `status` is not `trash` and not `spam` |
| **Starred** | `isStarred` is `true` and `status` is not `trash` or `spam` |
| **Drafts** | none: drafts are never stored messages; it shows the draft list (Drafts, below) |
| **Archive** | `status` is `archived` |
| **Trash** | `status` is `trash` |
| Custom label | `labelIds` contains that label ID and `status` is not `trash` or `spam` |

- **Ordering.** Results keep the server's order (`internalDate` descending).
- **Persistence.** The active chip is remembered for the session and restored when the user returns from the thread view.

### User actions

- **Select a chip.** Tapping an inactive chip makes it the only active chip. A chip whose list has loaded before shows it at once and refreshes it quietly; a chip never opened loads its first page.
- **Re-tapping.** Tapping the active chip again scrolls the list to the top.
- **Paging.** Each chip's list pages on its own, with its own `nextCursor` and the same `label`, when the user scrolls within one screen of its end (as §1 Load more).
- **Cache updates.** A response that returns a message (`PATCH`, mark as read, send) moves it between the loaded lists: out of every list whose rule it no longer meets, into every loaded list whose rule it now meets, at its date position. Archiving keeps a message in **All** (All is everything but trash and spam) and adds it to a loaded **Archive**; trashing removes it from All, Starred and its custom labels. A list with more pages to load only takes a message within the range it has loaded; a later page brings older ones.

### Loading state

The first page of a chip never opened shows skeleton rows; paging shows the inline spinner row (§1).

### Error states

Each chip's pages surface `GET /api/v1/messages`'s states:
- `UNAUTHENTICATED`: shared rule.
- `GMAIL_NOT_CONNECTED`: reconnect panel.
- `VALIDATION_FAILED` on a page (a stale cursor): that chip's list reloads from the first page.
- `INTERNAL`: an inline "Couldn't load more · Retry" row; other non-retryable errors show the row without Retry.

### Empty state

Shown when a chip's list is empty and has no `nextCursor`:
- **Starred:** "No starred messages."
- **Archive:** "Nothing in Archive."
- **Trash:** "Trash is empty."
- **Custom label:** "No messages with this label."
- **All:** the inbox empty state (§1).

Archive, Trash and custom-label empty states add a subtle line: "Only mail VibeMail has synced appears here." This is because the list holds only stored messages.

### Drafts

Primary endpoint: `GET /api/v1/drafts` (CONTRACT.md §4.13, *v1.1*). It also uses `DELETE /api/v1/drafts/{draftId}` (§4.12) and the compose drawer (§3).

- **What it shows.** Choosing Drafts swaps the message list for the user's Gmail drafts, newest first, under the title "Drafts" and "Updated {relative time}". Drafts live only in Gmail, so this list includes drafts saved in Gmail or on other devices.
- **When it is read.** Once when the app starts (for the sidebar count), each time Drafts is opened, and on Refresh while it is open; never on a timer. Further pages load near the end of the list with `nextCursor`.
- **Row.** The inbox row's grid: the drawn `draft` mark where a row has its star, the recipients (display names; "(no recipients)" when `to` is empty) where it has the sender, `updatedAt` as relative time, then `subject` ("(no subject)") — the body's first lines without the quoted reply.
- **Open.** Tapping a row opens the drawer on that draft (§3 Opened from Drafts). In split view the reading pane reads "Open a draft to keep writing it."
- **Discard.** The row menu's **Discard draft** calls `DELETE /api/v1/drafts/{draftId}`. The row dims while it is in flight, then leaves with a toast "Draft discarded". `MESSAGE_NOT_FOUND` counts as done; any other error toasts "Couldn't delete the draft in Gmail" and keeps the row.
- **Search.** Search covers stored messages only; drafts are not searched.
- **Loading:** skeleton rows; paging shows the inline spinner row.
- **Errors:** `GMAIL_NOT_CONNECTED` / `GMAIL_TOKEN_REVOKED` → the reconnect panel; any other first-load error → "Couldn't load your drafts" with Retry; a later page → "Couldn't load more · Retry"; `VALIDATION_FAILED` on a page → the list reloads from the start; a failed Refresh keeps the list and toasts "Couldn't refresh your drafts".
- **Empty:** "No drafts." with the line "Drafts you save here or in Gmail appear here."

---

## 5. Search

Primary endpoint: `GET /api/v1/messages/search` (§4.9, *v1.1*).

### Activation condition

- **When search is active.** The search field is focused and its trimmed text has at least 2 characters. The first request is sent 300 ms after the last keystroke.
- **Inactive.** Below 2 characters, search is inactive and the inbox list is shown unchanged.
- **Leaving search.** Clearing the field (the inline clear button) or pressing Escape ends search and restores the inbox with its previous chip and scroll position.
- **Shortcut.** ⌘K on Apple devices, Ctrl+K elsewhere (with no other modifier), focuses the search field and selects its text, from anywhere except the compose drawer. When a thread covers the list (narrower than the side-by-side layout), it first returns to the inbox. While the field is empty and unfocused it shows the shortcut for the device (`⌘K` or `Ctrl K`) at its right edge.
- **Query length.** The field accepts at most 200 characters.

### Default state

- **Layout.** Results replace the inbox list. No label is marked active while search is active, because results span every `status`; choosing one ends the search.
- **Rows.** Each result row is an inbox row (§1). It also shows a `status` badge when `status` is `archived`, `sent`, `trash` or `spam`. Terms from the query are highlighted in `subject`, `fromAddress` and `snippet`.
- **Paging.** The first request is `GET /api/v1/messages/search?q={query}&limit=25`.

### User actions

- **Refining the query.** Typing cancels any in-flight request, and only the response for the latest query is ever rendered. A new query starts again without a `cursor`.
- **Open a result:** the same as opening an inbox row (§1), including `POST /api/v1/messages/{id}/read` when `isRead` is `false`.
- **Row actions.** Star, mark unread, archive, trash and restore work exactly as in the inbox, through `PATCH /api/v1/messages/{id}`. Results stay in the list after the change, with their badge updated from the returned `status`.
- **Load more:** scrolling near the end requests `GET /api/v1/messages/search` with the same `q` and the last `nextCursor`, until `nextCursor` is `null`.

### Loading state

- **First request:** while the first request for a query is in flight, three skeleton rows appear under the field. Previous results stay visible but dimmed when the query is being refined.
- **Loading more:** a spinner row at the end of the list.

### Error states

- `UNAUTHENTICATED`: shared rule.
- `GMAIL_NOT_CONNECTED`: reconnect panel.
- `VALIDATION_FAILED`:
  - **query outside 2–200 characters** (only possible when the client check is bypassed): an inline hint under the field, "Search needs 2–200 characters";
  - **stale `cursor`:** the query restarts without a cursor.
- `INTERNAL`: a panel "Search isn't working right now", with Retry.

Row actions surface the inbox's `PATCH /api/v1/messages/{id}` and `POST /api/v1/messages/{id}/read` error states (§1).

### Empty state

When `messages` is empty on the first page, the app shows "No messages match your search.", centred, with the line "Search covers the mail VibeMail has synced, including archived and trashed messages."

---

## Visual direction

VibeMail Glass sets heavy frosted-glass surfaces over a deep navy background, a slow gradient from roughly #070D24 to #10204A with a faint indigo bloom behind the active view. Resting surfaces such as list rows, chips and thread cards use white glass at 8–14% fill opacity with a 20–32px backdrop blur, and raised surfaces such as the compose drawer, menus and panels rise to 14–22% opacity with a 32–48px blur. Every glass edge carries a 1px inner highlight of white at 15–25% opacity and a soft navy-tinted shadow, while text stays fully opaque so contrast stays at WCAG AA or better at every blur level.
