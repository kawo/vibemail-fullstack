# VibeMail Engine

A data-liberation sync engine for Gmail. Users sign in with Google. The engine mirrors their inbox into Supabase and exposes it through a small REST API at `/api/v1`, deployed as Vercel serverless functions.

Sync is **push-driven**. Gmail is read once at connect time (a full sync of the 50 newest INBOX messages), and after that only when a Gmail Pub/Sub notification arrives. Gmail is never polled.

> **Binding documents.** [`CONTRACT.md`](CONTRACT.md) defines every endpoint, error code, stored field and sync rule. [`BUILD_SEQUENCE.md`](BUILD_SEQUENCE.md) defines the build order. This README is an overview; if the two disagree, the contract wins.

## Stack

- Node.js and TypeScript (strict, pinned to 6.x)
- Vercel Functions on the Node.js runtime, from the top-level `api/` directory, with no framework
- Supabase: Postgres and Auth, with a single server-side service-role client
- `googleapis` (Gmail API v1) with `google-auth-library` 11
- Jest via `ts-jest`, plus `supertest`

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/auth/google` | none | Starts Google sign-in and redirects to the consent screen |
| `GET` | `/api/v1/auth/google/callback` | signed `state` and cookie | Exchanges the code, signs in to Supabase, stores the Gmail tokens, registers the watch, runs the initial sync, then redirects to the frontend |
| `GET` | `/api/v1/messages?limit&cursor` | Bearer | Lists stored messages from the DB, newest first, with cursor pagination |
| `POST` | `/api/v1/messages/send` | Bearer | Sends a plain-text message (`{ to, subject, body, threadId? }`) |
| `POST` | `/api/v1/messages/{id}/read` | Bearer | Marks one message as read |
| `PATCH` | `/api/v1/messages/{id}` | Bearer | v1.1: changes one message's labels (star, unread, archive, trash, restore) |
| `GET` | `/api/v1/threads/{threadId}` | Bearer | v1.1: stored messages of one thread, oldest first (DB only) |
| `GET` | `/api/v1/messages/search?q&limit&cursor` | Bearer | v1.1: searches stored messages (DB only) |
| `POST` | `/api/v1/drafts` | Bearer | v1.1: creates a Gmail draft |
| `PATCH` / `DELETE` | `/api/v1/drafts/{draftId}` | Bearer | v1.1: replaces or deletes a draft |
| `POST` | `/webhook/gmail?token=…` | Pub/Sub token | Receives Gmail push notifications, acks at once and syncs in the background |
| `GET` | `/api/cron/renew-watch` | `CRON_SECRET` bearer | Daily cron job that renews Gmail watches expiring within 24 h |

- **v1.1** rows are contracted in CONTRACT.md but not implemented yet.
- **Bearer** means a Supabase access token (HS256), verified locally.
- **Errors** always use the envelope `{ error: { code, message, retryable, details? } }` (CONTRACT.md §3.3).
- **Postman:** a collection is in [`docs/vibemail-api.postman_collection.json`](docs/vibemail-api.postman_collection.json).

## Project layout

```
api/                 Vercel function entry points (thin wrappers)
  v1/auth/google/    OAuth start and callback
  v1/messages/       list, send, mark-as-read
  webhook/gmail.ts   Pub/Sub push receiver (public path /webhook/gmail via rewrite)
  cron/              watch renewal
src/
  config/            environment loading
  db/                Supabase repositories, token encryption (only place with SQL)
  http/              request handling, CORS, responses
  middleware/        JWT auth, error mapping, OAuth state
  providers/         MailProvider interface and its Gmail implementation
  services/          account connection, Supabase sign-in
  sync/              full and incremental sync
  messages/ send/    endpoint logic
  webhook/ cron/     machine endpoint logic
  types/             DB row types and DTOs (owned by the schema session)
supabase/migrations/ SQL migrations
tests/unit/          unit tests against in-memory fakes
tests/integration/   tests against a real dev/test Supabase project
```

## Frontend

[`web/`](web/) holds **VibeMail Glass**, the Vite + React frontend that implements [`docs/design-system/DESIGN_SPEC.md`](docs/design-system/DESIGN_SPEC.md). It is a separate npm project with its own setup; see [`web/README.md`](web/README.md). Deploy it as its own Vercel project with `web` as the root directory, and set the engine's `FRONTEND_URL` to its origin.

## Getting started

### Prerequisites

- Node.js and npm
- The [Supabase CLI](https://supabase.com/docs/guides/cli) for migrations and type generation
- A Supabase project that signs tokens with the legacy **HS256 shared secret** and has the Google provider enabled, with your `GOOGLE_CLIENT_ID` listed among its authorized client IDs
- A Google Cloud project with:
  - an OAuth client whose authorized redirect URI is exactly `{origin}/api/v1/auth/google/callback`;
  - a Pub/Sub topic on which `gmail-api-push@system.gserviceaccount.com` may publish;
  - a push subscription pointing at `https://<host>/webhook/gmail?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`.

### Install and configure

```bash
npm install
```

```bash
cp .env.example .env
```

| Variable | Notes |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only. There is no anon key. |
| `JWT_SECRET` | The Supabase JWT secret (locally: `supabase status`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | The Google OAuth client. |
| `GOOGLE_PUBSUB_TOPIC` | `projects/<project>/topics/<topic>` |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | A random string of 32+ characters, also used in the push URL. |
| `ENCRYPTION_KEY` | 32 random bytes as base64, for AES-256-GCM token encryption. |
| `FRONTEND_URL` | The only CORS origin allowed; sign-in redirects to `{FRONTEND_URL}/auth/callback`. |
| `CRON_SECRET` | A random string of 32+ characters; Vercel sends it to the cron job. |

To generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

npm blocks the install scripts of `esbuild`, `unrs-resolver` and `@parcel/watcher`. If `vercel dev` or Jest fails to resolve modules, check them:

```bash
npm install-scripts ls
```

### Run locally

```bash
npm run dev
```

This runs `vercel dev`. Vercel runs cron jobs only in production, so trigger the renewal by hand with `vercel crons run /api/cron/renew-watch`, or send the bearer header yourself.

## Testing and type-checking

```bash
npm test
```

```bash
npm run typecheck
```

- `npm test` runs `jest --ci --runInBand`. `--runInBand` is required because the integration tests share one database.
- **Integration tests** (`npx jest tests/integration`) run against the dev/test Supabase project in `.env`, never production. They create and delete `@vibemail.test` users, and they need the migrations applied to that project.
- **Passing** means `numFailedTests`, `numPendingTests` and `numTodoTests` are all 0 in `--json` output. A leftover `.only` shows up as pending tests.
- **Type-checking** always goes through `tsconfig.check.json`. Never run bare `tsc`: the base `tsconfig.json` fails with TS6059 by design, and Vercel compiles `api/` itself.

## Database

```bash
npm run db:types
```

```bash
npm run db:push
```

- `db:types` regenerates `src/types/database.ts` from the linked project.
- `db:push` applies `supabase/migrations/` to the hosted project. Only run it after Gate 1 (below).
- Tables are `users` (one Google account per user, tokens encrypted) and `messages` (one row per mirrored message). RLS is enabled with no policies, so tenant isolation is enforced in `src/db/` by filtering every query on `user_id` (CONTRACT.md §5).

## Deployment

The project deploys to Vercel. [`vercel.json`](vercel.json) holds the `/webhook/gmail` rewrite, the daily cron (`0 6 * * *`) and per-function `maxDuration`. Set every variable above in the Vercel project.

With the Supabase GitHub integration, merging into `main` runs migrations on production.

## Contributing

Work is split between two sessions (CONTRACT.md §6):

| Session | Branch | Owns |
|---|---|---|
| Server logic | `main` | `api/`, `src/` (except `src/types/`), `tests/`, `vercel.json`, `package.json` |
| Schema | `schema` | `supabase/migrations/`, `src/types/` |

The `schema` branch is merged only after **Gate 1** passes: in a throwaway worktree with `schema` merged into `main`, `npm test` exits 0 and type-checking is clean. CONTRACT.md §6 has the exact commands.

Ground rules:

- Change `CONTRACT.md` first, in the same PR, for any change to an endpoint, an `ErrorCode` or a stored field (§7).
- Never use `any`, never poll Gmail, never store tokens in plaintext, never hardcode credentials.

See [`CLAUDE.md`](CLAUDE.md) for the full set of conventions.
