# VibeMail Glass

The VibeMail frontend: a glassmorphic mail client for the VibeMail Engine. It implements the behavioural spec in [`docs/DESIGN_SPEC.md`](../docs/DESIGN_SPEC.md) against the API in [`CONTRACT.md`](../CONTRACT.md).

Built with Vite, React and TypeScript. It has no router or state library: a small history router (`src/router.ts`) and one message cache (`src/state/store.ts`) are enough.

## Setup

```bash
npm install
```

```bash
cp .env.example .env.local
```

| Variable | Notes |
|---|---|
| `VITE_API_URL` | The engine's origin, e.g. `http://localhost:3000` under `vercel dev`. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The Supabase project the engine signs users in to. The anon key is public; the app uses it only to keep, refresh and sign out its own session. |

The engine allows exactly one CORS origin, its `FRONTEND_URL`. The dev server runs on port 3001 to match the engine's default `FRONTEND_URL=http://localhost:3001`.

## Scripts

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run build
```

With `npm run dev` running, `/gallery.html` shows the compose drawer's states and error states side by side, rendered from the same `ComposeSheet` with sample content. It is not part of the app build.

## How it maps to the spec

| Spec | Code |
|---|---|
| Shared rules (auth refresh, reconnect, retry) | `src/api/client.ts`, `src/App.tsx` |
| §1 Inbox and its label filter bar | `src/components/inbox/` (`InboxView`, `SearchBar`, `LabelFilterBar`, `MessageList`, `MessageRow`, `ComposeButton`) |
| §2 Thread view | `src/components/thread/` (`ThreadView`, `ThreadHeader`, `MessageCard`, `Avatar`, `ThreadSkeleton`), `HtmlBody.tsx`, `src/lib/thread.ts` |
| §3 Compose drawer (default, reply, draft-restored; mobile keyboard) | `src/compose/ComposeDrawer.tsx` (state, autosave, send), `src/compose/sheet/` (`ComposeSheet`, `ComposeHeader`, `RecipientField`, `BodyField`) |
| §4 Label filter | `src/lib/filters.ts` |
| §5 Search | `src/components/search/` (`SearchView`, `SearchResultList`); the field is `inbox/SearchBar` |
| Visual direction (VibeMail Glass design system tokens) | `src/styles.css` |

Two contract invariants are enforced by the request types in `src/api/types.ts`:
- **`status`:** no request type has a `status` field; it changes only through labels.
- **`draftId`:** `DraftRequest` has no `draftId`; a received one is only echoed in a URL path.

## Known limits (from the contract)

- **Custom label chips show label IDs:** they read `Label_12` rather than a name, because no endpoint returns label names.
- **Drafts restore on the same device only:** no endpoint lists or fetches drafts.
- **Attachments are listed but can't be downloaded.**
- **Stored mail only:** the inbox, thread view and search cover only mail the engine has stored, not the whole Gmail mailbox.
