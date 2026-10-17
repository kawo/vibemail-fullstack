# VibeMail Glass on the real API — design

Date: 2026-10-17 · Status: draft for approval

## Intent

The web client still runs on sample data (`data/data.js` through `sampleSource`). The engine it
was built against exists in the same repository and already implements every CONTRACT.md §4
endpoint. This change makes the client talk only to the engine, over relative paths on one
origin, and deletes the sample data. While doing it, every place where the client or engine
differs from the contract is fixed, and three behaviour changes land: server-side label
filtering, `bodyPlain`-first thread bodies, and a "View in Gmail" link.

## Goals

1. Every client data call goes through `httpSource` to a relative `/api/v1/...` path. No sample
   mode, no `NEXT_PUBLIC_DATA_SOURCE`, no `NEXT_PUBLIC_API_URL`.
2. One Vercel project and one origin serve both the Next.js client and the engine.
3. `GET /api/v1/messages` filters on the server by label (contract amended first, §7).
4. Thread view renders `bodyPlain` first, `bodyHtml` in a sandboxed frame only when `bodyPlain`
   is `null`.
5. The thread header has a "View in Gmail" link beside the read toggle and the star.
6. `data/` is deleted, with every reference.

## Non-goals

- No count endpoint. Sidebar counts stay approximate (see Client below).
- No deployment setup (project creation, env vars on Vercel, domains). Only the code and
  config that make a single-project deploy possible.
- No change to search, drafts, send or auth semantics beyond relative paths.
- No DB migration. Filtering uses existing columns (`status`, `is_starred`, `label_ids`).

## Anti-goals

- The engine stops working on its own or its Jest suite stops passing: the `api/` handlers
  stay the source of truth; Next.js only re-exports them.
- `draftId` or `status` ever sent in a request body.
- A client-side filter silently disagreeing with the server's: the server is authoritative.

## Decisions taken with the user

| Topic | Decision |
|---|---|
| Filtering | Server-side. CONTRACT.md §4.2 gains a query parameter; engine implements it with tests. |
| Hosting | One Vercel project. Next.js route handlers re-export the existing `api/` handlers. |
| HTML frame | `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`: no scripts; links open in a new tab. |
| Sample data | Delete `data/`, `sampleSource` and the sample sign-in. CLAUDE.md updated. |
| Token | JWT bearer read from the session persisted in `localStorage` (below). |

## Contract change — CONTRACT.md §4.2 (v1.2)

`ListMessagesQuery` gains `label`:

```ts
interface ListMessagesQuery {
  limit?: number;   // 1..100, default 25
  cursor?: string;  // opaque
  label?: string;   // 'all' (default) | 'starred' | 'archive' | 'trash' | a custom label ID (Label_…)
}
```

| `label` | Rows where |
|---|---|
| `all` | `status` not in (`trash`, `spam`) |
| `starred` | `is_starred` and `status` not in (`trash`, `spam`) |
| `archive` | `status = 'archived'` |
| `trash` | `status = 'trash'` |
| `Label_…` | `label_ids` contains it and `status` not in (`trash`, `spam`) |

- These are DESIGN_SPEC §4's existing rules, moved to the server.
- `label` must be one of the four keywords or match `^Label_[A-Za-z0-9_-]+$`; otherwise
  `VALIDATION_FAILED`. System label IDs (`INBOX`, `UNREAD`, …) are rejected; the keywords cover
  the views the client needs.
- Ordering, keyset, cursor format and `lastSyncedAt` are unchanged. A cursor is only meaningful
  with the `label` it was issued for; the client always resends the same `label`. The server
  does not encode the label in the cursor (it stays `{ d, g }`).
- Still never calls Gmail.

Engine: `parseListQuery` validates `label`; `MessagesRepository.listMessages` takes a filter and
applies it with the Supabase query builder (`neq status`, `eq is_starred`, `eq status`,
`contains label_ids`), still scoped by `user_id` (§5.3). The in-memory fake repository mirrors
it. Unit tests cover parsing and every filter; the integration suite covers one filtered
request end to end against the dev/test project.

## Hosting — one Next.js project

- Add `app/api/v1/**/route.ts` for each engine endpoint, each one line of re-exports from the
  matching `api/` file (`export { GET, OPTIONS } from '…/api/v1/messages'`), plus
  `export const runtime = 'nodejs'` and, where `vercel.json` sets it today, `maxDuration`
  (callback 60, webhook 60, cron 300).
  - The engine's handlers already take a Web `Request` and parse path parameters from the URL,
    so Next.js's extra `context` argument is ignored.
  - Dynamic segments: `app/api/v1/messages/[id]/route.ts`, `…/[id]/read/route.ts`,
    `app/api/v1/threads/[threadId]/route.ts`, `app/api/v1/drafts/[draftId]/route.ts`.
- The webhook becomes `app/webhook/gmail/route.ts` directly, so the `vercel.json` rewrite goes.
- The cron becomes `app/api/cron/renew-watch/route.ts`; `vercel.json` keeps only `crons`.
  `buildCommand`, `outputDirectory`, `rewrites` and `functions` are removed (Next.js builds the
  project; durations live in the route files).
- `next.config.ts`: `serverExternalPackages: ['googleapis']` if the build needs it.
- Engine code stays compiled by `tsconfig.check.json` for `npm run typecheck`; Next.js also
  compiles it through the route files with `tsconfig.next.json`. Any incompatibility is fixed in
  config, not by changing engine behaviour.
- Same origin: `FRONTEND_URL` and the `GOOGLE_REDIRECT_URI` origin are the client's origin
  (`http://localhost:3001` locally). CORS headers stay as the contract says; they are harmless
  on same-origin requests.
- Local development: `npm run web:dev` serves client and engine together. `.env.example` is
  updated (one origin; the engine's env vars are read by the Next.js server).

## Client

- **Data source.** `app/services/index.ts` exports `httpSource` only. `sampleSource.ts`, its
  test, `data/`, `DATA_SOURCE` and `API_URL` are deleted; `httpSource` calls relative paths.
- **Session.** The callback fragment is stored with the Supabase auth client
  (`GoTrueClient`, `persistSession: true`), which keeps the session in `localStorage`. Each call
  reads the access token from it and sends `Authorization: Bearer`. On `UNAUTHENTICATED` it
  refreshes once (needs `NEXT_PUBLIC_SUPABASE_URL` and the public `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  the engine's "no anon key" rule is about DB access and is unaffected), then signs out.
  Sign-in navigates to the relative `/api/v1/auth/google`.
- **Filtering.** The store keeps one list per label (`ids`, `nextCursor`, `lastSyncedAt`, load
  state), fetched with `label`. The fill-the-first-screen paging and "Look further" row go;
  each label pages on its own. Choosing a label shows its cached list at once if it has one and
  refreshes it. `matchesChip` stays only to drop a message from the visible list when a
  `PATCH` response moves it out (e.g. archiving under All), and to add it to a cached list it
  now matches.
- **Counts.** Unread counts are computed over every message in the shared cache, whichever list
  loaded it. They remain approximate, as DESIGN_SPEC §1 already says.
- **Thread body.** Expanded card: `bodyPlain` (line breaks kept) when not `null`; otherwise
  `bodyHtml` sanitised in the sandboxed frame (remote images blocked until allowed, as now);
  otherwise `snippet`.
- **View in Gmail.** In the thread header, beside the read toggle and the star: an icon link
  "View in Gmail" to `https://mail.google.com/mail/?authuser=<account email>#all/<threadId>`,
  `target="_blank"`, `rel="noopener noreferrer"`. Gmail accepts the API's hex thread ID in the
  `#all/` fragment; `authuser` opens the right account when several are signed in.
- **Contract gaps.** An audit pass over every call site against §3–§4: error codes handled per
  each endpoint's table, `Retry-After` on `GMAIL_RATE_LIMITED`, `details.sentGmailId` on a send
  that succeeded upstream (no resend), `MESSAGE_NOT_FOUND` on draft delete treated as done,
  `VALIDATION_FAILED` on a stale cursor reloading from the start. Each gap found is fixed and
  listed in the change.

## Documents

- CONTRACT.md: §4.2 `label`, a v1.2 note at the top (§7: contract first, in the same change).
- DESIGN_SPEC.md: §2 body order and the header link; §4 filtering is server-side (fill rules
  removed); §1 counts wording.
- CLAUDE.md: Web client section (no sample data; route re-exports; one origin; dev command),
  Stack/Deployment bullets, the `data.js` rule removed.
- README.md and `.env.example`: one origin, the env vars the client needs.

## Verification

- Engine: `npm test` (Jest, including integration against the dev/test project) passes with 0
  failed, pending and todo; `npm run typecheck` clean.
- Client: `web:test`, `web:typecheck`, `web:build` pass.
- In the running app (`web:dev`), without Google credentials: the sign-in page loads, the
  sign-in button navigates to `/api/v1/auth/google` and gets the engine's response (a redirect,
  or `CONFIG_ERROR` if env is missing), and an unauthenticated `GET /api/v1/messages` returns
  the §3.3 `UNAUTHENTICATED` envelope through the Next.js route.
- A full signed-in pass needs a real Google account and env; that is left to the user and
  stated as not verified.

## Calls made by the builder (for review)

- `label` is one parameter with keywords plus custom IDs, rather than separate `status` /
  `starred` / `labelId` parameters, so each sidebar chip is one value.
- Counts stay client-side and approximate rather than adding a count endpoint.
- The webhook moves to a Next.js route at its public path instead of keeping a rewrite.
