# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

VibeMail Engine is a data-liberation sync engine. It extracts a user's Gmail data via OAuth2 into Supabase and exposes it through a REST API at `/api/v1`, deployed as Vercel serverless functions.

Two documents are binding; read them before any change:
- **`CONTRACT.md`**: scope, acceptance criteria (§2), auth (§3.1), error envelope (§3.3), sync procedure (§3.5), endpoint contracts (§4), data model (§5), tenant isolation (§5.3), two-session rule (§6).
- **`BUILD_SEQUENCE.md`**: eight atomic build units in order. Each unit's **Verified** check must pass before the next starts.

Any change to an endpoint, an `ErrorCode` or a stored field goes into `CONTRACT.md` first, in the same change (§7).

## Stack

- **Runtime and language:** Node.js and TypeScript in strict mode. TypeScript is **pinned to 6.x**, because `ts-jest` does not support 7.
- **Gmail:** `googleapis` (183.x) with `google-auth-library` 11.x.
  - Construct clients only as `new OAuth2Client({ clientId, clientSecret, redirectUri })`; the positional form is deprecated.
  - Detect revocation by `GaxiosError` with `response.data.error === 'invalid_grant'`.
  - `users.watch` uses `labelFilterBehavior: 'INCLUDE'`; `labelFilterAction` is deprecated and ignored when the newer field is set.
- **Database:** the Supabase JS client, using a single service-role client. There is no anon key.
- **Auth tokens:** `jsonwebtoken` verifies Supabase access tokens.
- **Tests:** Jest via `ts-jest`, plus `supertest`. `supertest` needs a small adapter, because the handlers take a Web `Request` rather than a Node `http.Server`.
- **Deployment:** the engine's handlers live in `src/endpoints/`; each file exports `GET`/`POST(request: Request): Promise<Response>` on the Node.js runtime (never Edge). Next.js route files re-export them, so one project serves the engine and the web client (see Web client). `maxDuration` lives in those route files; `vercel.json` holds only the cron job.
- **Never add a top-level `api/` folder.** Vercel builds it as standalone functions even under the Next.js preset, on the same output paths as the grouped Next.js route functions, and they replace each other: routes then run another route's handler (`docs/deploy-routing-issue.md`). `tests/unit/nextRoutes.test.ts` guards this.
- **Two tsconfigs.** `tsconfig.json` is the base config (`rootDir: ./src`). Never run bare `tsc`; Next.js compiles `src/endpoints/` through the route re-exports.
  - **Type-checking:** always via `tsconfig.check.json`, which extends the base config with `rootDir: "."`, `noEmit`, `tests/`, and `types: ["node", "jest"]`. TypeScript 6 no longer loads `@types/*` packages automatically.
  - **Target is ES2020:** there is no `Error.cause` or other ES2022 library API. Declare such fields explicitly (see `ProviderError`).
  - **Jest:** `jest.config.js` (CommonJS; a `.ts` config fails to load as an ES module) points ts-jest at `tsconfig.check.json`.
- **Blocked install scripts:** npm blocked them for `esbuild`, `unrs-resolver` and `@parcel/watcher`. If Next.js or Jest resolution fails, check `npm install-scripts ls`.

## Web client

The VibeMail Glass web client is a Next.js 15 (App Router) + React 19 app at the repo root, beside the engine. One Next.js project serves both on one origin: the client calls the engine only over CONTRACT.md §4, by relative path (`/api/v1/...`), with the JWT bearer from the Supabase session kept in `localStorage`. There is no sample data and no offline mode.

- **Layout:** `app/` holds the client routes (`auth/`, `auth/callback/`, `(mail)/inbox`, `(mail)/thread/[threadId]`) and, beside them, `app/components/` (the UI: one `MessageRow`; `ComposeDrawer` with a `mode` prop), `app/lib/` (pure logic and its tests), `app/services/` (the data layer, `DataSource`, served by `httpSource`) and `app/styles/` (the glass CSS and design-system tokens). Those four folders have no `page` or `route` file, so they are never routable; never name a file in them after a Next.js special file (`layout`, `page`, `route`, `loading`, `error`, `template`, `not-found`, `default`), which is why the breakpoints live in `app/lib/breakpoints.ts`. At the root, `state/` holds the client stores, including one server-filtered list per label. Imports use `@/app/…` and `@/state/…`.
- **Engine routes:** `app/api/**/route.ts` and `app/webhook/gmail/route.ts` are one-line re-exports of the `src/endpoints/` handlers (plus `runtime = 'nodejs'` and, where needed, `maxDuration`). They are the only client-side files that import engine code; `tests/unit/nextRoutes.test.ts` checks each `src/endpoints/` handler has its route. A new engine endpoint needs its route file too.
- **Config:** `next.config.ts`, `tsconfig.next.json` (Next type-checks with this, never with the engine's `tsconfig.json`) and `vitest.config.mts`. The client needs `NEXT_PUBLIC_SUPABASE_URL` and the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` to keep and refresh the session; the engine's "no anon key" rule is about DB access.
- **Commands:** `npm run web:dev` (port 3001: the client and every engine endpoint; `FRONTEND_URL` and the `GOOGLE_REDIRECT_URI` origin are `http://localhost:3001`), `web:build`, `web:start`, `web:test` (Vitest) and `web:typecheck`.
- **Shared files:** root `package.json`, `package-lock.json`, `.gitignore`, `.env.example` and `vercel.json` carry both. They are server-session-owned.
- **Deploy:** one Vercel project with the Next.js framework preset. `vercel.json` builds with `npm run typecheck && npm run web:build` and holds only the cron schedule.

## Commands

```bash
npm test                            # jest --ci --runInBand
npx jest tests/unit/foo.test.ts     # single file
npx jest -t "name of test"          # single test by name
npm run typecheck                   # tsc -p tsconfig.check.json (src/, api/, tests/); `npm run build` runs the same
npm run web:dev                     # next dev on :3001: the web client and every engine endpoint
npx jest tests/integration          # integration tests against the dev/test Supabase project in .env (never production)
npm run db:types                    # schema session only: regenerate src/types/database.ts from the linked project
npm run db:push                     # pushes migrations to the hosted project; only after Gate 1 (CONTRACT.md §6)
```

`--runInBand` is required because the integration tests share one database: the dev/test project in `.env`. They create and delete `@vibemail.test` auth users there, and they need the schema branch's migration applied to that project. A run counts as passing only when `numFailedTests`, `numPendingTests` and `numTodoTests` are all 0 in `--json` output. A leftover `.only` surfaces as pending tests.

## The two-session architecture

| Session | Branch | Owns | Never writes |
|---|---|---|---|
| Server logic | `main` | `src/` except `src/types/` (including `src/db/`), `tests/`, `vercel.json`, `package.json` | `supabase/migrations/`, `src/types/` |
| Schema | `schema` | `supabase/migrations/`, `src/types/` | everything else, especially `src/db/` |

Migrations live in `supabase/migrations/`, because that is the only directory the Supabase CLI applies.

Server code imports from `src/types/`, which exists only on `schema` until the merge. So `main` on its own does not typecheck. All verification runs in a throwaway worktree with `schema` merged into `main` (CONTRACT.md §6 has the exact commands).

## Sequencing rule

**The schema session cannot be merged until the server-logic tests pass.** `npm test` must exit 0, and `npm run typecheck` and lint must be clean, in the Gate 1 worktree, on the current tips of both branches.

The order is:
1. The schema session drafts the schema and pushes it unmerged.
2. The server session builds every unit and passes Gate 1.
3. The schema session reviews against CONTRACT.md §5 and only then merges.

With the Supabase GitHub integration, merging into `main` runs the migration on production.

## Never-do rules

- **Never use `any`** as a TypeScript type.
- **Never poll the Gmail API for new messages.** Use Pub/Sub push webhooks. Gmail is read only by the initial full sync at connect time and by the webhook (CONTRACT.md §3.5). `GET /api/v1/messages` reads the DB only.
- **Never store OAuth tokens in plaintext.** `refresh_token` and `access_token` are encrypted with AES-256-GCM using `ENCRYPTION_KEY`, in `src/db/` only (CONTRACT.md §5.4).
- **Never make Gmail API calls without the `googleapis` `OAuth2` client.** It handles token refresh automatically. Its `'tokens'` listener persists `access_token` and `access_token_expires_at` as a pair; a missing `expiry_date` makes the library treat a token as never-expiring.
- **Never write to `src/db/` from the schema session.**
- **Never merge the schema session before `npm test` exits 0.**
- **Never hardcode credentials.** All secrets come from env. The full list is in CONTRACT.md §3.6, and the template is `.env.example`.

## Coding conventions

- **Errors:** every error response uses the CONTRACT.md §3.3 envelope `{ error: { code, message, retryable, details? } }`, with the closed `ErrorCode` union. Do not add codes without updating §3.3.
- **Pagination:** every list endpoint uses cursor-based pagination. The cursor is opaque base64url keyset `(internal_date DESC, gmail_id DESC)`, and responses return `nextCursor`. No offsets. The one exception is the draft list (`GET /api/v1/drafts`, CONTRACT.md §4.13): drafts live only in Gmail, so its cursor wraps Gmail's page token.
- **Paths:** every client endpoint lives under `/api/v1`.
- **Auth:** JWT Bearer auth on every `/api/v1` endpoint except the two Google sign-in endpoints (CONTRACT.md §4.1).
  - `GET /api/v1/auth/google` takes no auth. It sets a short-lived HttpOnly state cookie and redirects to Google.
  - `GET /api/v1/auth/google/callback` checks the HMAC-signed `state` against that cookie and exchanges the code. It signs the user in to Supabase with `signInWithIdToken` on a throwaway client, never the shared service-role client. It stores the Gmail tokens, then redirects to `FRONTEND_URL/auth/callback`, with the session only in the URL fragment.
  - Tokens are verified in `src/middleware/auth.ts` with `jwt.verify(token, key, { algorithms, audience: 'authenticated', issuer: SUPABASE_URL + '/auth/v1' })`: an HS256 token with `JWT_SECRET` and `['HS256']`; an ES256/RS256 token with the project's JWKS key for its `kid` (`src/middleware/jwks.ts`) and only that key type's algorithm. The pinned allow-list is mandatory; never pass a public key where HS256 is allowed. Supabase projects now sign with asymmetric keys by default, so tests that sign their own HS256 tokens don't prove real sessions verify.
  - `userId` comes only from the token's `sub`.
- **Machine endpoints** are outside `/api/v1` and don't use the user JWT:
  - The Pub/Sub webhook is at **`/webhook/gmail`**, implemented in `src/endpoints/webhook/gmail.ts` and served at that path by `app/webhook/gmail/route.ts`. It authenticates with a `?token=` query parameter equal to `GOOGLE_PUBSUB_VERIFICATION_TOKEN`, compared in constant time.
  - The cron job is at `/api/cron/renew-watch` and authenticates with the `CRON_SECRET` bearer.
- **Account table:** `users`, keyed by `google_id` (the token-info `sub`), with a unique `user_id` linking it to the Supabase user. The connect upsert is `ON CONFLICT (google_id)` guarded by `user_id` (CONTRACT.md §5.2).
- **Tenant isolation:** the service-role client bypasses RLS, so every user-scoped query lives in `src/db/` and filters on `user_id`. That includes `attachments` (CONTRACT.md §5.5).
  - Attachment files live in the private Storage bucket `attachments`, read and signed only through `src/storage/attachments.ts` with the service role. Object paths are `{user_id}/{attachmentId}`, built from the token's `sub` and a server UUID, never from client input.
  - Only `findAccountByEmailUnscoped` (webhook) and `listConnectedAccountsUnscoped({ watchExpiringBefore })` (cron) may skip that filter.
  - RLS is enabled with no policies, which closes the public Data API.
- **History records carry only IDs:** label changes are deltas, applied to stored `label_ids`; an unknown message is fetched and stored; a 404 on `get` is skipped (CONTRACT.md §3.5).
- **Sync state:** sync starts from the **stored** `history_id`, never from a notification's `historyId`. That value only advances, under a per-user advisory lock. A `history.list` 404 falls back to a full sync of the 50 newest messages.
- **Webhook responses:** the webhook verifies the token and decodes the body, then returns `200` at once and runs the sync inside `waitUntil` (`@vercel/functions`). Background failures are logged, not retried. Never move sync work before the ack.
- **Attachments (v1.3):** files never pass through a function (Vercel caps request bodies at 4.5 MB). `POST /api/v1/attachments` reserves a row and returns a signed Storage URL; the browser PUTs the file there without any VibeMail token. 25 MB per file and per message; over that is `FILE_TOO_LARGE` (413).
- **Send:** the input is `{ to, subject, body, threadId?, attachmentIds? }`. Attachments are loaded and size-checked before any Gmail call, read one at a time, and sent as `multipart/mixed` by Gmail media upload. `threadId` is passed to Gmail unchanged; no reply headers are derived. The sent message is fetched back with `messages.get`, because `messages.send` returns only `id`, `threadId` and `labelIds`.
