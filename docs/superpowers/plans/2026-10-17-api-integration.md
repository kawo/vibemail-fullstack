# VibeMail Glass on the real API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web client talks only to the engine over relative `/api/v1` paths on one origin, with server-side label filtering, `bodyPlain`-first thread bodies, a "View in Gmail" link, and no sample data.

**Architecture:** CONTRACT.md §4.2 gains a `label` filter, implemented in the engine (`src/messages/list.ts`, `src/db/messages.ts`). Thin Next.js route files under `app/api/**` and `app/webhook/**` re-export the existing `api/` handlers so one Next.js project serves both. The client drops `sampleSource`/`data/`, calls relative paths, and keeps one server-filtered list per label in the store.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest (client), Jest + ts-jest (engine), Supabase JS, googleapis.

**Spec:** `docs/superpowers/specs/2026-10-17-api-integration-design.md`

## Global Constraints

- Never use `any`. TypeScript strict. Engine target ES2020 (no `Error.cause`).
- Never run bare `tsc`. Engine: `npm run typecheck`; client: `npm run web:typecheck`.
- Engine tests: `npx jest --ci --runInBand`; a pass needs `numFailedTests`, `numPendingTests`, `numTodoTests` all 0. Client tests: `npx vitest run`.
- Every user-scoped query lives in `src/db/` and filters on `user_id`.
- `draftId` and `status` are never sent in a request body.
- Contract change goes into CONTRACT.md in the same commit as the code (§7).
- `label` values: `all` (default) | `starred` | `archive` | `trash` | `^Label_[A-Za-z0-9_-]+$`.
- HTML frame: `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"`.
- Gmail link: `https://mail.google.com/mail/?authuser=<encodeURIComponent(email)>#all/<threadId>`, `target="_blank" rel="noopener noreferrer"`.
- Route `maxDuration`: auth callback 60, webhook 60, cron 300. Every engine route: `runtime = 'nodejs'`.
- No DB migration. Do not touch `supabase/migrations/` or `src/types/`.

## Review Focus

1. Archiving (or trashing, starring, restoring) a message while a label is shown: it leaves that label's list at once and appears in any cached list it now matches. Test in Task 4.
2. A stale `cursor` (e.g. kept across a refresh) answered with `VALIDATION_FAILED`: the list reloads from the first page instead of showing an error. Test in Task 6.
3. `bodyPlain` that is `""` or whitespace only: treated like `null`, so the HTML body (or snippet) shows instead of a blank card. Test in Task 5.
4. A `label` value outside the allowed set (`INBOX`, `label_1`, empty): `400 VALIDATION_FAILED` with `details.issues[0].field === 'label'`. Test in Task 1.
5. No session in `localStorage` (signed out in another tab): a data call sends no bearer, gets `UNAUTHENTICATED`, signs out and the guard goes to `/auth`. Test in Task 3.

---

### Task 1: Server-side `label` filter (contract + engine)

**Files:**
- Modify: `CONTRACT.md` (top-of-file version note; §4.2 Request, a new "Filter" table, Errors row for `label`)
- Modify: `src/messages/list.ts` (`parseListQuery`, `listMessages`)
- Modify: `src/db/messages.ts` (`MessagesRepository.listMessages`, Supabase implementation)
- Modify: `tests/fakes/memoryRepos.ts` (`listMessages`)
- Create: `tests/unit/listFilter.test.ts`
- Modify: `tests/integration/endpoints.test.ts` (one filtered request)

**Interfaces:**
- Produces: `export type ListFilter = { kind: 'all' } | { kind: 'starred' } | { kind: 'archive' } | { kind: 'trash' } | { kind: 'label'; labelId: string }` in `src/db/messages.ts`.
- Produces: `parseListQuery(url: URL): { limit: number; cursor: ListCursor | null; filter: ListFilter }`.
- Produces: `MessagesRepository.listMessages(userId: string, limit: number, after: ListCursor | null, filter: ListFilter): Promise<MessageRow[]>`.
- Produces (HTTP): `GET /api/v1/messages?label=…`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/listFilter.test.ts`

```ts
describe('GET /api/v1/messages label filter (CONTRACT.md §4.2)', () => {
  it('defaults to all', () => expect(parseListQuery(new URL('http://x/api/v1/messages')).filter).toEqual({ kind: 'all' }));
  it.each(['all', 'starred', 'archive', 'trash'])('accepts %s', (label) =>
    expect(parseListQuery(new URL(`http://x/?label=${label}`)).filter).toEqual({ kind: label }));
  it('accepts a custom label ID', () =>
    expect(parseListQuery(new URL('http://x/?label=Label_12')).filter).toEqual({ kind: 'label', labelId: 'Label_12' }));
  it.each(['INBOX', 'label_1', '', 'Label_', 'Label_1;drop'])('rejects %j', (label) => {
    expect(() => parseListQuery(new URL(`http://x/?label=${encodeURIComponent(label)}`))).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED', details: { issues: [expect.objectContaining({ field: 'label' })] } }),
    );
  });
});
```

Plus, through `buildApp()` with the in-memory repos (pattern of `tests/unit/v11Endpoints.test.ts`), seed one row per case — inbox, starred inbox, starred trash, archived, trash, spam, inbox with `Label_7` — and assert the `gmailId`s returned for each `label`:
`all` → inbox, starred, archived, labelled · `starred` → starred only · `archive` → archived · `trash` → trash and starred-trash · `Label_7` → labelled.
Also: `?label=starred&limit=1` pages through starred rows with `nextCursor` and no duplicates.

- [ ] **Step 2: Run** `npx jest tests/unit/listFilter.test.ts` — Expected: FAIL (`filter` undefined).

- [ ] **Step 3: Implement**
  - `parseListQuery`: read `label` (missing → `all`); invalid → `ApiError('VALIDATION_FAILED', 'invalid label', { details: { issues: [{ field: 'label', message: "all, starred, archive, trash or a Label_ ID" }] } })`. An empty `?label=` is invalid.
  - `listMessages(deps, userId, query)` passes `query.filter` to the repository.
  - Supabase repo: after the existing `user_id` and keyset clauses, `all`/`label` → `.not('status', 'in', '(trash,spam)')`; `starred` → that plus `.eq('is_starred', true)`; `archive` → `.eq('status', 'archived')`; `trash` → `.eq('status', 'trash')`; `label` → plus `.contains('label_ids', [labelId])`.
  - Memory repo: the same predicate in JS before `page()`.
  - CONTRACT.md: add `label` to `ListMessagesQuery` with the five-row table from the spec, the validation rule, "a cursor is only meaningful with the `label` it was issued for", and a `VALIDATION_FAILED` trigger for `label`. Top note: "*v1.2:* §4.2 `label` filter."

- [ ] **Step 4: Add the integration case** in `tests/integration/endpoints.test.ts`: seed an archived and an inbox row for one user; `GET /api/v1/messages?label=archive` returns only the archived one. Run `npx jest tests/integration/endpoints.test.ts --runInBand` — Expected: PASS.

- [ ] **Step 5: Run** `npx jest --ci --runInBand` and `npm run typecheck` — Expected: all pass, 0 pending/todo; typecheck clean.

- [ ] **Step 6: Commit** `CONTRACT.md src/ tests/` — "Filter the message list by label on the server (CONTRACT.md §4.2 v1.2)".

---

### Task 2: One Next.js project serves the engine

**Files:**
- Create (each a re-export of the same-named `api/` handler, plus `export const runtime = 'nodejs'`):
  `app/api/v1/auth/google/route.ts`, `app/api/v1/auth/google/callback/route.ts` (`maxDuration = 60`), `app/api/v1/messages/route.ts`, `app/api/v1/messages/search/route.ts`, `app/api/v1/messages/send/route.ts`, `app/api/v1/messages/[id]/route.ts`, `app/api/v1/messages/[id]/read/route.ts`, `app/api/v1/threads/[threadId]/route.ts`, `app/api/v1/drafts/route.ts`, `app/api/v1/drafts/[draftId]/route.ts`, `app/api/cron/renew-watch/route.ts` (`maxDuration = 300`), `app/webhook/gmail/route.ts` (`maxDuration = 60`)
- Modify: `vercel.json` (keep `$schema` and `crons` only), `next.config.ts` (`serverExternalPackages: ['googleapis']` if `web:build` needs it), `tsconfig.next.json` (include `api/`, `src/` only if the build requires)
- Create: `tests/unit/nextRoutes.test.ts`

**Interfaces:**
- Consumes: every `api/**/*.ts` handler's named exports (`GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS` as each file has them).
- Produces: the same public paths on the Next.js origin; `/webhook/gmail` without a rewrite.

- [ ] **Step 1: Write the failing test** `tests/unit/nextRoutes.test.ts`: for every file under `api/` (walk the directory), compute its route path (`api/v1/messages/index.ts` → `app/api/v1/messages/route.ts`; `api/webhook/gmail.ts` → `app/webhook/gmail/route.ts`; `[id].ts` → `[id]/route.ts`), assert the route file exists, re-exports exactly the handler's exported HTTP methods (compare `Object.keys(await import(apiFile))` with the route module's keys minus `runtime`/`maxDuration`), and has `runtime === 'nodejs'`; assert the three `maxDuration` values above.

- [ ] **Step 2: Run** `npx jest tests/unit/nextRoutes.test.ts` — Expected: FAIL (route files missing).

- [ ] **Step 3: Create the route files and update `vercel.json`.**

- [ ] **Step 4: Run** `npx jest tests/unit/nextRoutes.test.ts`, `npm run typecheck`, `npm run web:typecheck`, `npm run web:build` — Expected: all pass; build lists the new `ƒ /api/...` and `ƒ /webhook/gmail` routes.

- [ ] **Step 5: Smoke** with `npm run web:dev`: `curl -s localhost:3001/api/v1/messages` → `401` body `{"error":{"code":"UNAUTHENTICATED",…}}`; `curl -si -X POST localhost:3001/api/v1/auth/google` → `405` with `Allow: GET`.

- [ ] **Step 6: Commit** — "Serve the engine from the Next.js project through route re-exports".

---

### Task 3: Relative API calls, no sample data

**Files:**
- Delete: `data/` (all of it), `app/services/sampleSource.ts`, `app/services/__tests__/sampleSource.test.ts`
- Modify: `app/services/index.ts` (export `httpSource` as `api`), `app/services/source.ts` (comment), `app/services/httpSource.ts` (relative paths), `app/lib/config.ts` (drop `DATA_SOURCE`, `API_URL`), `app/lib/auth/session.ts` (drop every sample branch and `SAMPLE_*`; `startSignIn` → `window.location.assign('/api/v1/auth/google')`), `tsconfig.next.json`/`vitest.config.mts`/`next.config.ts` (drop `@/data` alias if any), any test fixture importing `@/data`
- Create: `app/services/__tests__/httpSource.test.ts`

**Interfaces:**
- Consumes: `currentSession(): Promise<AppSession | null>`, `refreshSession()`, `signOut()` from `app/lib/auth/session.ts` (unchanged signatures).
- Produces: `httpSource.listMessages(label: string, cursor?: string, limit?: number, signal?: AbortSignal): Promise<ListMessagesResponse>` — `label` is now the first parameter (also in `DataSource`).

- [ ] **Step 1: Write the failing tests** in `app/services/__tests__/httpSource.test.ts` (stub `fetch` and mock `@/app/lib/auth/session`):
  - `listMessages('archive', 'c1', 25)` calls `fetch('/api/v1/messages?limit=25&cursor=c1&label=archive', …)` — a relative URL — with `Authorization: Bearer tok`.
  - `createDraft({ to: [], subject: '', body: '' })` sends a body with no `draftId` key.
  - With `currentSession()` → `null` and a `401 UNAUTHENTICATED` response, the call sends no `Authorization` header, calls `refreshSession()`, then `signOut()`, emits `'signed-out'`, and rejects with `ApiError` code `UNAUTHENTICATED` (Review Focus 5).

- [ ] **Step 2: Run** `npx vitest run app/services` — Expected: FAIL (absolute `API_URL` / old `listMessages` signature).

- [ ] **Step 3: Implement** the deletions and changes above; update every `api.listMessages` call site to pass the label (Task 4 completes the store; here pass `'all'`).

- [ ] **Step 4: Run** `npx vitest run`, `npm run web:typecheck`, and `grep -rn "@/data\|sampleSource\|DATA_SOURCE\|API_URL\|NEXT_PUBLIC_API_URL" app state data 2>/dev/null` — Expected: tests pass, typecheck clean, grep empty.

- [ ] **Step 5: Commit** — "Call the engine over relative paths; delete the sample data".

---

### Task 4: One server-filtered list per label

**Files:**
- Modify: `state/store.ts` (per-label lists), `state/inboxUi.tsx` (`useLoadedMessages` over the whole cache), `app/components/inbox/InboxView.tsx`, `app/components/inbox/MessageList.tsx` (drop `lookFurther`/fill rows), `state/actions.ts` (list membership after `PATCH`)
- Modify: `app/lib/filters.ts` (remove `shouldFill`; add `labelParam`)
- Create: `app/lib/lists.ts`, `app/lib/__tests__/lists.test.ts`; update `app/lib/__tests__/filters.test.ts`

**Interfaces:**
- Consumes: `api.listMessages(label, cursor, limit, signal)` (Task 3); `matchesChip(message, chip)` (existing).
- Produces: `labelParam(chip: Chip): string` — `all|starred|archive|trash` or the custom `labelId` (Drafts never reaches it).
- Produces: `interface ListState { ids: string[]; nextCursor: string | null; lastSyncedAt: string | null; state: LoadState; error: ApiError | null; loadingMore: boolean; moreError: ApiError | null; refreshing: boolean }`; `store.lists: Map<string, ListState>` keyed by `chipKey`; `loadList(chip: Chip, options?: { refresh?: boolean }): Promise<void>`; `loadMoreOf(chip: Chip, signal?: AbortSignal): Promise<void>`.
- Produces (pure, `app/lib/lists.ts`): `placeInLists(lists: ReadonlyMap<string, ListState>, chips: readonly Chip[], message: MessageDTO, cache: ReadonlyMap<string, MessageDTO>): Map<string, ListState>` — removes `message.gmailId` from every list whose chip it no longer matches and inserts it, by `(internalDate DESC, gmailId DESC)`, into every *loaded* list it now matches.

- [ ] **Step 1: Write the failing tests** in `app/lib/__tests__/lists.test.ts`:
  - archiving a message present in `all` and `archive` lists: after `placeInLists` with `status: 'archived'`, it is gone from `all`'s ids, and present in `archive`'s ids at its date position (Review Focus 1).
  - trashing removes it from `all`, `starred` and `Label_7`; starring a message inserts it into a loaded `starred` list; an unloaded list (`state: 'idle'`) is left untouched.
  - `labelParam` returns `'all'`, `'starred'`, `'archive'`, `'trash'`, `'Label_12'` for the five chip kinds.

- [ ] **Step 2: Run** `npx vitest run app/lib` — Expected: FAIL.

- [ ] **Step 3: Implement** `lists.ts`, then the store: `loadList` fetches page 1 with `labelParam(chip)` (a list with data shows at once and refreshes); `loadMoreOf` pages with that list's own cursor and label; every `PATCH`/read/send response goes through `placeInLists`. `InboxView` reads `store.lists.get(chipKey(chip))` and loads it on chip change; remove `fillPages`, `filling`, `lookFurther`, `shouldFill`. `useLoadedMessages` computes counts and custom labels over every cached message.

- [ ] **Step 4: Run** `npx vitest run`, `npm run web:typecheck` — Expected: pass.

- [ ] **Step 5: Commit** — "Keep one server-filtered list per label".

---

### Task 5: Thread body order and "View in Gmail"

**Files:**
- Modify: `app/components/thread/MessageCard.tsx` (body order), `app/components/thread/HtmlBody.tsx` (keep sandbox value from Global Constraints), `app/components/thread/ThreadHeader.tsx` (link), `app/components/icons.tsx` (`external` icon), `app/styles/app.css` (link uses `.icon-btn` look)
- Modify: `app/lib/thread.ts`, `app/lib/__tests__/thread.test.ts`

**Interfaces:**
- Consumes: `useAccountEmail(): string | null` (`app/components/sidebar/useAccountEmail.ts`).
- Produces: `bodyKind(message: Pick<MessageDTO, 'bodyPlain' | 'bodyHtml'>): 'plain' | 'html' | 'snippet'`; `gmailThreadUrl(threadId: string, email: string | null): string`.

- [ ] **Step 1: Write the failing tests** in `app/lib/__tests__/thread.test.ts`:
  - `bodyKind({ bodyPlain: 'hi', bodyHtml: '<p>hi</p>' })` → `'plain'`; `{ bodyPlain: null, bodyHtml: '<p>x</p>' }` → `'html'`; `{ bodyPlain: '  \n', bodyHtml: '<p>x</p>' }` → `'html'` (Review Focus 3); `{ bodyPlain: '', bodyHtml: null }` → `'snippet'`.
  - `gmailThreadUrl('18c2f0a1b2', 'you@example.com')` → `'https://mail.google.com/mail/?authuser=you%40example.com#all/18c2f0a1b2'`; with `null` email → `'https://mail.google.com/mail/#all/18c2f0a1b2'`.

- [ ] **Step 2: Run** `npx vitest run app/lib/__tests__/thread.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** both helpers; `MessageCard` switches on `bodyKind`; `ThreadHeader` adds, between the star and Archive, `<a className="icon-btn" href={gmailThreadUrl(threadId, email)} target="_blank" rel="noopener noreferrer" aria-label="View in Gmail" title="View in Gmail"><Icon name="external" /></a>`. Icon: 16px grid, 1.5px stroke — a box with an arrow leaving its top-right corner.

- [ ] **Step 4: Run** `npx vitest run`, `npm run web:typecheck` — Expected: pass.

- [ ] **Step 5: Commit** — "Show bodyPlain first and link the thread to Gmail".

---

### Task 6: Contract-gap audit of error handling

**Files:**
- Modify only where a gap is found: `state/store.ts`, `state/actions.ts`, `state/drafts.ts`, `app/components/compose/ComposeDrawer.tsx`, `app/components/search/SearchView.tsx`, `app/components/thread/ThreadView.tsx`
- Create/extend tests next to each pure piece changed

**Interfaces:**
- Consumes: `ApiError` (`code`, `status`, `details`, `retryAfterSeconds`, `canRetry`).

Checks (each one: read the call site against CONTRACT.md §4.x Errors; fix if it differs; the fix carries a test when the logic is pure):
1. `listMessages` / `search` / `listDrafts` page with `VALIDATION_FAILED` → reload from page 1, no error row (Review Focus 2).
2. `GMAIL_RATE_LIMITED` on send, label update, draft save → action disabled for `retryAfterSeconds` with a countdown (DESIGN_SPEC shared rules).
3. `send` error with `details.sentGmailId` → drawer closes as sent ("Sent"), no resend offered.
4. `deleteDraft` → `MESSAGE_NOT_FOUND` treated as success.
5. `markRead` / `updateLabels` → `MESSAGE_NOT_FOUND` removes the message from the cache and every list.
6. `getThread` → `MESSAGE_NOT_FOUND` shows the thread's not-found state, not a retry.
7. Retry buttons only when `canRetry`.

- [ ] **Step 1:** For each check, write the failing test (pure helper) or note "already compliant" with the file:line that proves it.
- [ ] **Step 2: Run** `npx vitest run` — Expected: the new tests fail.
- [ ] **Step 3:** Fix each gap.
- [ ] **Step 4: Run** `npx vitest run`, `npm run web:typecheck` — Expected: pass.
- [ ] **Step 5: Commit** — "Handle every contract error code as specified", the message listing each gap fixed.

---

### Task 7: Documents and full verification

**Files:**
- Modify: `docs/design-system/DESIGN_SPEC.md` (§2 body order; §2 header gains "View in Gmail"; §4 filtering is server-side, fill rules and "Look further" removed; counts wording), `CLAUDE.md` (Web client: no sample data, route re-exports, one origin, `web:dev` serves both; Deployment bullet; remove "Keep `data.js` intact"), `README.md`, `.env.example` (`FRONTEND_URL` and `GOOGLE_REDIRECT_URI` on `http://localhost:3001`; remove `NEXT_PUBLIC_DATA_SOURCE`, `NEXT_PUBLIC_API_URL`)

- [ ] **Step 1: Edit the documents.**
- [ ] **Step 2: Run** `npx jest --ci --runInBand --json --outputFile=…` (0 failed/pending/todo), `npm run typecheck`, `npx vitest run`, `npm run web:typecheck`, `npm run web:build` — Expected: all pass.
- [ ] **Step 3: Smoke** in the browser pane with `web:dev`: `/auth` renders; "Sign in with Google" navigates to `/api/v1/auth/google` and gets the engine's redirect or a `CONFIG_ERROR` envelope; `/inbox` without a session goes to `/auth`. Record that a signed-in pass was not run.
- [ ] **Step 4: Commit** — "Document the single-origin client on the real API".
