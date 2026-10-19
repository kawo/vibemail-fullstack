# VibeMail Engine — Contract

> Status: **v1, binding.** Any change to an endpoint, error code, or stored field is made in this file first (see §7).
> **v1.1 additions** (marked *Added in v1.1*) support the VibeMail Glass frontend (`docs/design-system/DESIGN_SPEC.md`): message `status`, label updates, thread view, search and drafts (including the draft list, §4.13). They are implemented, with the §5.1 `status` migration and their tests.
> **v1.2 change** (marked *Changed in v1.2*): `GET /api/v1/messages` filters by `label` on the server (§4.2), so the frontend no longer filters loaded messages itself. Bearer verification also accepts tokens signed with the Supabase project's asymmetric signing keys (§3.1).
> **v1.3 addition** (marked *Added in v1.3*): attachments, implemented with the §5.5 migration and their tests. `POST /api/v1/attachments` (§4.14) reserves an upload, which goes from the browser straight to Supabase Storage through a signed URL; `POST /api/v1/messages/send` takes `attachmentIds` (§4.3); `GET /api/v1/messages/{id}/attachments/{partId}` downloads a stored message's attachment through a signed Storage URL (§4.15). New table and Storage bucket (§5.5) and a new error code, `FILE_TOO_LARGE` (§3.3).
> Stack: Vercel Functions (Node.js runtime); the handlers live in `src/endpoints/` (never a top-level `api/` folder, which Vercel would build as separate functions) and, *changed in v1.2*, are served through Next.js route files that re-export them, so the frontend and every endpoint share one project and origin · TypeScript · Supabase (Postgres + Auth) · `googleapis` (Gmail API v1).

---

## 1. Purpose & scope

The VibeMail Engine is the backend that connects a user's Gmail account, mirrors their mail into Supabase, and exposes user-facing endpoints (Google sign-in, message list, send, mark as read and, from v1.1, label updates, thread view, search, drafts and the draft list) plus two machine-facing endpoints (the Gmail Pub/Sub webhook and the watch-renewal cron job).

**In scope (v1)**

- Google sign-in through Supabase Auth with offline access to Gmail.
- Gmail → DB sync (§3.5), **push-driven only**. Gmail is never polled.
  - An initial full sync runs when the account is connected (§4.1).
  - Every later sync is triggered by a Gmail push notification (Pub/Sub webhook, §4.5).
- Gmail `users.watch` registration at sign-in (§4.5) and daily renewal by a Vercel Cron Job (§4.6).
- Listing stored messages from the DB with cursor pagination.
- Sending new messages and replies (plain text and/or HTML).
- Marking a single message as read.
- *Added in v1.1:*
  - a derived message `status` (§3.4);
  - changing one message's labels: star, unstar, mark unread, archive, move to trash, restore (§4.7);
  - a thread view and full-text search, both read from the DB only (§4.8, §4.9);
  - creating, updating and deleting Gmail drafts (§4.10–§4.12);
  - listing the user's Gmail drafts, read from Gmail on request (§4.13).
  - Filtering by label happens in the client, on `status`, `isStarred` and `labelIds`; there is no filter endpoint.
- *Added in v1.3:* uploading an attachment of up to 25 MB, reserved by the API and stored in Supabase Storage (§4.14), and sending a message with uploaded attachments, up to 25 MB together (§4.3);
  - downloading one attachment of a stored message, up to 25 MB, read from Gmail on request (§4.15).

**Out of scope (v1)**

- Attachments on drafts: a draft carries text only, even when the message being written has attachments. Stored attachment *metadata* on received mail is in scope.
- Downloading attachments over 25 MB (§4.15), downloading an upload back, and cleaning up Storage objects.
- File uploads through a function: Vercel Functions take at most 4.5 MB of request body, so files go to Storage directly (§4.14).
- Server-side label/unread filters.
- Scheduled jobs other than watch renewal. In particular, there is no scheduled or request-triggered sync: Gmail is read only at connect time and on push. The thread view and search read the DB only, so they see only stored messages.
- Permanent delete, emptying the trash, and batch operations.
- Fetching a single draft, and sending a draft by `draftId`.
- Multiple Gmail accounts per user.

---

## 2. Acceptance criteria

The project is complete when **every** item below is true and verifiable.

1. Every route in §4 exists at its exact path and accepts/returns exactly the shapes defined there.
2. Every `ErrorCode` listed in an endpoint's error table has at least one Jest test that triggers it and asserts the HTTP status and the error envelope from §3.3.
3. `jest --ci --runInBand` passes (TypeScript via `ts-jest`, TypeScript pinned to 6.x because `ts-jest` does not support 7), including the integration tests in `tests/integration/`. They run against the **dev/test Supabase project** configured in `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), with the `schema` branch's migration applied there, in the §6 Gate 1 worktree. They never run against production.
4. `npm run typecheck` (`tsc -p tsconfig.check.json`, covering `src/` and `tests/`) passes with `strict: true`, and lint passes with zero errors.
5. A fixture test maps a recorded Gmail `users.messages.get?format=full` response to a `messages` row that matches §5 field for field. It includes a nested `multipart/alternative` inside `multipart/mixed` and one attachment.
6. Sync is tested for: first sync (no stored `historyId` → full sync, which stores at most 50 messages even when the inbox holds more), incremental sync (`history.list`), and fallback (`history.list` returns HTTP 404 → full sync). `GET /api/v1/messages` makes zero Gmail API calls (asserted with a fake `MailProvider` that fails on any call).
7. Mark-as-read is idempotent: calling it twice on the same message returns `200` both times with `isRead: true`.
8. Sending with `threadId` passes it unchanged to `messages.send`, and the raw MIME carries the client's subject and no derived threading headers (asserted on the Gmail request). A `threadId` Gmail doesn't know returns `MESSAGE_NOT_FOUND`.
9. A Google `invalid_grant` on token refresh maps to `GMAIL_TOKEN_REVOKED` on every Gmail-backed endpoint, and clears the stored access token.
   Access-token persistence (§3.1) is tested:
   - a stored token more than 5 minutes from expiry is reused with no refresh call;
   - a token within 5 minutes of expiry is refreshed, and the new token and expiry are persisted;
   - writing an access token without an expiry is rejected by the DB.
10. The webhook is tested for these cases:
    - **Valid notification:** returns `200` before any provider call, then applies exactly the history delta since the stored `history_id`, and saves the last `history.list` page's `historyId`.
    - **Duplicate or stale notification:** a notification whose `historyId` is ≤ the stored one makes no Gmail calls.
    - **Bad or missing `token` query parameter:** rejected with `401`.
    - **Unknown mailbox:** acknowledged without any Gmail call.
    - **Watch renewal cron (§4.6):**
      - a request without the correct `CRON_SECRET` bearer is rejected with `401` and makes no Gmail call;
      - an authorized run calls `users.watch` once for every connected account whose watch is missing, expired or within 24 h of expiry, skips the rest, and updates `watch_expiration`;
      - one account failing (including `invalid_grant`) does not stop the others.
11. Tenant isolation is tested:
    - through every user-facing endpoint, user A cannot read or modify user B's `messages` or `users` rows;
    - every repository function takes `userId` and its query filters on it (§5.3);
    - a token signed with the wrong secret, or with a different `alg`, is rejected.
12. The sequencing rule in §6 was followed, and its gates are recorded in the PR descriptions.
13. *Added in v1.1:*
    - `status` is derived by the §3.4 rule on every write of `label_ids` (sync, send, mark as read, §4.7), with one test per value; no request body can set it.
    - `GET /api/v1/threads/{threadId}` and `GET /api/v1/messages/search` make zero Gmail API calls (asserted as in criterion 6).
    - `PATCH /api/v1/messages/{id}` routes `TRASH` changes to `messages.trash` / `messages.untrash` and every other change to `messages.modify`.
    - The draft endpoints never accept a `draftId` in a request body; it comes only from the path.
    - `GET /api/v1/drafts` skips a draft that Gmail returns 404 for between `drafts.list` and `drafts.get`, its `nextCursor` round-trips Gmail's `nextPageToken`, and it makes no DB query beyond loading `users`.

---

## 3. Shared conventions

### 3.1 Authentication

- **No session cookies.** Every `/api/v1` endpoint except the two Google sign-in endpoints requires `Authorization: Bearer <Supabase access token>`.
  - The frontend gets that token from the sign-in flow (§4.1), which hands over a Supabase session.
  - The sign-in endpoints are browser navigations and can't carry a header. The start endpoint needs no auth. The callback authenticates with the signed `state`, bound to the browser by a short-lived state cookie (§4.1a). That is the only cookie the API sets, and it never holds a session.
  - **Verification** (*changed in v1.2*). The token is checked locally with `jsonwebtoken`: `jwt.verify(token, key, { algorithms, audience: 'authenticated', issuer: SUPABASE_URL + '/auth/v1' })`. The key and the `algorithms` allow-list come from the token header, and each path accepts only its own algorithm:
    - `alg: HS256`: the legacy shared secret, `JWT_SECRET`, with `['HS256']`.
    - `alg: ES256` or `RS256` with a `kid`: the project's public signing key with that `kid`, from `SUPABASE_URL + '/auth/v1/.well-known/jwks.json'`, with the algorithm of that key's type (`['ES256']` for EC, `['RS256']` for RSA). Only `EC` and `RSA` entries are used.
    - Anything else (including `alg: none` and a `kid` the project doesn't publish) → `UNAUTHENTICATED`. The pinned allow-lists block algorithm-confusion attacks: a public key is never accepted as an HMAC secret.
    - The key set is cached per warm instance for 10 minutes; an unknown `kid` refetches it at most every 30 seconds. If the keys can't be fetched and none are cached, the request fails `INTERNAL` (500), not `UNAUTHENTICATED`, so an outage doesn't sign users out.
    - Projects on Supabase's asymmetric signing keys (the default for new projects) and projects on the legacy secret both work. Locally, the secret is the `JWT secret` printed by `supabase status`.
  - The caller's identity is `claims.sub` (the `user_id`) and `claims.email`.
  - A missing, malformed, expired or wrongly signed token → `UNAUTHENTICATED`.
  - Known limit: local verification does not see server-side sign-out, so a revoked session's token stays accepted until it expires (Supabase default: 1 h). This is accepted for v1.
  - **No anon key.** All DB access, for every endpoint, uses one server-only Supabase client created with `SUPABASE_SERVICE_ROLE_KEY`. This client bypasses RLS, so tenant isolation is enforced in code (§5.3).
- The webhook (§4.5) and the cron job (§4.6) take no user token; they authenticate with `GOOGLE_PUBSUB_VERIFICATION_TOKEN` and `CRON_SECRET` respectively.
- Gmail calls use a `googleapis` `OAuth2` client built from the app's Google client ID/secret (env). Its credentials are seeded from `users`: `refresh_token`, `access_token`, and `expiry_date` (from `access_token_expires_at`, as epoch ms).
- **Access-token persistence.**
  - **Reuse.** The client reuses the stored access token until it is within 5 minutes of expiry, the library's default `eagerRefreshThresholdMillis`. Then it refreshes.
  - **Listener.** A `client.on('tokens')` listener persists every refresh:
    - `access_token` and `access_token_expires_at` are always written;
    - `refresh_token` is written only when Google returns a new one.
  - **Paired columns.** `access_token` and `access_token_expires_at` are always written together, or both set to `null`. `google-auth-library` treats a credential with no `expiry_date` as *never expiring*, so an access token stored without an expiry would never be refreshed. A DB `CHECK` enforces the pairing (§5.2).
  - **Revocation.** On `invalid_grant`, both access-token columns are set to `null`.
- **Gmail grant: backend OAuth.** The backend runs Google's authorization-code flow itself (§4.1): `GET /api/v1/auth/google` → consent → `GET /api/v1/auth/google/callback` → code exchange.
  - The exchange's `id_token` signs the user in to Supabase (`signInWithIdToken`).
  - Gmail tokens never pass through Supabase Auth; they are stored encrypted in `users` (§5.4).
- Required Google scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`, `https://www.googleapis.com/auth/gmail.modify` and `https://www.googleapis.com/auth/gmail.send`. The consent URL uses `access_type=offline` and `prompt=consent`, so that Google returns a refresh token.
  - Google's token info returns the account's `email` and `sub` only when `userinfo.email` was granted.
  - `openid` makes the code exchange return an `id_token`. With `userinfo.profile`, that token carries the account's `name`.
  - No separate profile or userinfo API call is made.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` configure every `OAuth2Client`.
  - The client is always constructed with the options object, `new OAuth2Client({ clientId, clientSecret, redirectUri })`, because the positional-argument form is deprecated in `google-auth-library` 11.
  - `GOOGLE_REDIRECT_URI` must be exactly `{origin}/api/v1/auth/google/callback`, and it must be registered as an authorized redirect URI on that Google OAuth client.
- **Revocation detection.** A refresh rejected for a revoked or invalid refresh token surfaces as a `GaxiosError` with `response.data.error === 'invalid_grant'`. That check is the only trigger for `GMAIL_TOKEN_REVOKED`.

### 3.2 Format

- **CORS.** Every `/api/v1` endpoint allows exactly one origin, `FRONTEND_URL`.
  - Responses carry `Access-Control-Allow-Origin: <FRONTEND_URL>` and `Vary: Origin`.
  - `OPTIONS` preflights get `204`, with `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE` (`PATCH` and `DELETE` added in v1.1), `Access-Control-Allow-Headers: Authorization, Content-Type` and `Access-Control-Max-Age: 600`.
  - No credentials are allowed: bearer endpoints use no cookies.
  - The webhook and cron endpoints send no CORS headers.
- JSON request and response bodies use camelCase. DB columns use snake_case.
- Timestamps in JSON are ISO-8601 UTC strings (`2026-10-03T14:05:00.000Z`).
- Gmail IDs (`id`, `threadId`, `historyId`) are always strings.

### 3.3 Error envelope

Every error response, on every endpoint, has this shape.

```ts
type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'GMAIL_NOT_CONNECTED'
  | 'GMAIL_TOKEN_REVOKED'
  | 'VALIDATION_FAILED'
  | 'MESSAGE_NOT_FOUND'
  | 'GMAIL_RATE_LIMITED'
  | 'GMAIL_UPSTREAM_ERROR'
  | 'SYNC_FAILED'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFIG_ERROR'
  | 'FILE_TOO_LARGE'   // Added in v1.3
  | 'INTERNAL';

interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;          // human-readable, safe to show; never contains tokens
    retryable: boolean;
    details?: Record<string, unknown>; // e.g. { issues: ZodIssue[] } for VALIDATION_FAILED
  };
}
```

| Code | HTTP | `retryable` | Meaning |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | false | Missing or invalid bearer token, or an invalid OAuth `state` (§4.1b). |
| `GMAIL_NOT_CONNECTED` | 409 | false | The user has no `users` row, no refresh token, or is missing the required scopes. |
| `GMAIL_TOKEN_REVOKED` | 401 | false | Google rejected the refresh token (`invalid_grant`). The user must sign in again. |
| `VALIDATION_FAILED` | 400 | false | The request params or body failed validation. |
| `MESSAGE_NOT_FOUND` | 404 | false | The message ID is not in this user's mailbox (DB or Gmail). From v1.1 it also covers a thread with no stored messages (§4.8) and a draft ID Gmail doesn't know (§4.11, §4.12); `details` then names `threadId` or `draftId`. |
| `GMAIL_RATE_LIMITED` | 429 | true | Gmail returned 429 or a 403 `rateLimitExceeded`/`userRateLimitExceeded`. Sets the `Retry-After` header (seconds). |
| `GMAIL_UPSTREAM_ERROR` | 502 | true | Gmail returned 5xx or an unexpected 4xx. |
| `SYNC_FAILED` | 502 | true | Reserved. Webhook syncs run after the ack (§4.5), so their failures are logged, not returned. |
| `METHOD_NOT_ALLOWED` | 405 | false | The OAuth endpoints (§4.1) received a method other than `GET`. Sets the `Allow: GET` header. |
| `CONFIG_ERROR` | 500 | false | The OAuth endpoints (§4.1) are missing a required environment variable. Other endpoints report this as `INTERNAL` (§3.6). |
| `FILE_TOO_LARGE` | 413 | false | *Added in v1.3.* A file is over 25 MB (§4.14, `details: { maxBytes, size }`), or a message's attachments are over 25 MB together (§4.3, `details: { maxBytes, totalBytes }`). `maxBytes` is `26214400`. |
| `INTERNAL` | 500 | false | Unhandled server or DB error. |

### 3.4 `MessageDTO`

Every endpoint that returns a message uses this shape. It is the §5 `messages` row in camelCase, without `id`, `user_id`, `created_at`, `updated_at`.

```ts
interface AttachmentMeta {
  partId: string;
  filename: string;
  mimeType: string;
  size: number;          // bytes
  attachmentId: string;
}

interface MessageDTO {
  gmailId: string;
  threadId: string;
  labelIds: string[];
  status: MessageStatus;         // added in v1.1; derived, never client-set (see below)
  isRead: boolean;
  isStarred: boolean;
  snippet: string;
  historyId: string;
  internalDate: string;          // ISO-8601
  sizeEstimate: number;
  subject: string | null;
  fromAddress: string;
  toAddress: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  rfc822MessageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  dateHeader: string | null;
  bodyPlain: string | null;
  bodyHtml: string | null;
  attachments: AttachmentMeta[];
  syncedAt: string;              // ISO-8601
}

type MessageStatus = 'inbox' | 'sent' | 'archived' | 'trash' | 'spam';   // added in v1.1
```

**`status` derivation** (*Added in v1.1*). `status` is computed by the server from `labelIds` **at write time**, on every write of `label_ids`: sync (§3.5), send (§4.3), mark as read (§4.4) and label updates (§4.7). The first matching rule wins:

1. `labelIds` contains `TRASH` → `'trash'`
2. contains `SPAM` → `'spam'`
3. contains `INBOX` → `'inbox'`
4. contains `SENT` → `'sent'`
5. otherwise → `'archived'`

No request body accepts `status`. A client changes it only indirectly, by changing labels (§4.7).

### 3.5 Sync procedure

The procedure is shared by the connect endpoint (§4.1) and the webhook (§4.5); no other code path reads mail from Gmail. It runs under `pg_advisory_xact_lock(hashtext(user_id::text))`, and `history_id` only ever advances (§4.5, step 5).

- **Full sync** (when `history_id` is `null`, or on the 404 fallback): `users.messages.list({ labelIds: ['INBOX'], maxResults: 50 })`, paging with `pageToken` until 50 IDs are collected or the inbox is exhausted, so at most the 50 most recent INBOX messages. Then `users.messages.get({ format: 'full' })` each one and upsert it on `(user_id, gmail_id)`. A `get` that returns 404 is skipped. Finally, set `users.history_id` from the `historyId` of the newest fetched message, because `messages.list` responses carry no `historyId`.
- **Incremental sync** (otherwise): `users.history.list({ startHistoryId: history_id, historyTypes: ['messageAdded','messageDeleted','labelAdded','labelRemoved'] })`, paging until done.
  - History records carry only message `id`s (and `threadId`), so every change is applied as follows:
  - `messagesAdded` → `get` + upsert.
    - If `get` returns **404** (the message was deleted before the sync reached it), skip it and delete any stored row for that `gmail_id`. This is not an error.
  - `messagesDeleted` → delete the row (a no-op if there is none).
  - `labelsAdded` / `labelsRemoved` carry only the label IDs that changed, not the message's full label set:
    - **If the row exists:** apply the change to the stored `label_ids` (set union for added, set difference for removed), then recompute `is_read`, `is_starred` and `status` (§3.4).
    - **If the row does not exist** (e.g. an older message beyond the initial 50 was moved into `INBOX`): `get` the message and upsert it, so its full, current label set is stored. A 404 there is skipped as above.
  - Records are applied in the order returned, so a later record wins.
  - Afterwards, set `history_id` to the response's `historyId`.
- **404 fallback.** If `history.list` returns **404** (the start ID is outside the retained history window), fall back to a full sync. Through the provider abstraction this surfaces as `ProviderError` with `kind: 'cursor_expired'` (`src/providers/provider.ts`).
- Both kinds set `users.last_synced_at = now()`.
- *Added in v1.1:* a fetched message whose `labelIds` contain `DRAFT` is never stored, and any stored row for it is deleted. `history.list` reports draft changes even though the watch covers only INBOX; drafts are served by §4.10–§4.12 instead.

### 3.6 Environment variables

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | Every DB call; JWT issuer check (§3.1) |
| `SUPABASE_SERVICE_ROLE_KEY` | The single DB client (§3.1, §5.3) |
| `JWT_SECRET` | Bearer verification (§3.1) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | `OAuth2Client` (§3.1) |
| `GOOGLE_PUBSUB_TOPIC` | `users.watch` (§4.5) |
| `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | Webhook authentication (§4.5) |
| `ENCRYPTION_KEY` | Token encryption (§5.4) |
| `FRONTEND_URL` | CORS (§3.2) |
| `CRON_SECRET` | Cron authentication (§4.6). The name is fixed by Vercel |

A missing required variable fails the function with `500 INTERNAL` and a log line naming the variable, never its value. The sign-in endpoints (§4.1a, §4.1b) answer `500 CONFIG_ERROR` instead.

### 3.7 `DraftDTO` (*Added in v1.1*)

Every draft endpoint returns this shape. Drafts live in Gmail only; they are not stored in the DB.

```ts
interface DraftDTO {
  draftId: string;     // Gmail draft ID; server-managed (see below)
  gmailId: string;     // Gmail ID of the draft's current message; changes on every update
  threadId: string;    // Gmail-assigned, or the threadId the draft was created with
  to: string[];
  subject: string;
  body: string;        // plain text
  updatedAt: string;   // ISO-8601, server time of the create or update
}
```

**`draftId` is server-managed.** Gmail assigns it on create (§4.10). A client never supplies one in a request body; it only echoes one it received from §4.10, §4.11 or §4.13 back in the path of §4.11 and §4.12.

**Draft request body** (§4.10, §4.11):

```ts
interface DraftRequest {
  to?: string | string[];  // 0..100 addresses; the §4.3 address rules apply to each one
  subject?: string;        // default ""; the §4.3 subject rules apply
  body?: string;           // default ""
  threadId?: string;       // the §4.3 threadId rule applies
}
```

A draft may be incomplete: no recipients, an empty subject and an empty body are all valid. Any `draftId` or `status` key in the body → `VALIDATION_FAILED`.

---

## 4. Endpoint contracts

### 4.1 Sign in with Google — backend OAuth flow

Google sign-in is the only way in. One flow signs the user in to Supabase and connects their Gmail in the same step. Neither endpoint takes a bearer.
- **Start** (`GET /api/v1/auth/google`): the browser navigates there, for example from a "Sign in with Google" link. It answers `302` to Google.
- **Callback** (`GET /api/v1/auth/google/callback`): Google redirects the browser there. It answers `302` to the frontend, carrying the Supabase session.

**Prerequisite:** Supabase Auth must have the Google provider enabled, with `GOOGLE_CLIENT_ID` listed among its authorized client IDs. Otherwise every sign-in ends with `INTERNAL` and `reason=SUPABASE_SIGN_IN_FAILED`.

#### 4.1a Start — `GET /api/v1/auth/google`

**Request:** no auth, body or query.

**Behavior:** `initiateOAuth` (`src/providers/gmail/auth.ts`) issues a signed `state` and builds the consent URL (scopes from §3.1, `access_type=offline`, `prompt=consent`).

**State format:** `base64url(JSON.stringify({ exp, nonce }))` + `.` + `base64url(HMAC-SHA256(JWT_SECRET, payload))`, where:
- `exp` is now + 10 minutes (epoch seconds);
- `nonce` is 16 random bytes.

**State cookie** (login-CSRF defence): `vibemail_oauth_state=<nonce>; Path=/api/v1/auth/google; Max-Age=600; HttpOnly; Secure; SameSite=Lax`. It binds the `state` to the browser that started the flow. It is the only cookie the API sets, and it never holds a session.

**Response — `302 Found`:** `Location: <consent URL>`, `Cache-Control: no-store`, `Set-Cookie: <state cookie>`.

**Errors** (§3.3 envelope, no redirect):

| Code | HTTP | When |
|---|---|---|
| `METHOD_NOT_ALLOWED` | 405 | Any method other than `GET`. Sets `Allow: GET`. |
| `CONFIG_ERROR` | 500 | `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` or another required variable is missing. |
| `INTERNAL` | 500 | An unexpected exception. |

#### 4.1b Callback — `GET /api/v1/auth/google/callback?code&state` (or `?error&state`)

No bearer. Every outcome is a **`302`** to `{FRONTEND_URL}/auth/callback`, with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and a `Set-Cookie` that clears the state cookie.

| Outcome | `Location` |
|---|---|
| Signed in | `{FRONTEND_URL}/auth/callback?status=signed_in&initialSync=completed\|failed#access_token=…&refresh_token=…&expires_in=…&expires_at=…&token_type=bearer` |
| Any error | `{FRONTEND_URL}/auth/callback?status=error&code=<ErrorCode>[&reason=<details.reason>]` (no fragment) |

The session tokens travel **only in the fragment**: browsers never send it to a server, so it stays out of request logs and `Referer` headers. The frontend reads it, calls `supabase.auth.setSession({ access_token, refresh_token })`, then clears it with `history.replaceState`.

**Behavior**

1. **Verify `state`.**
   - The HMAC is checked in constant time and `exp` must be in the future.
   - The state cookie must be present, and its nonce must equal the state's `nonce` (constant-time comparison).
   - A missing, tampered or expired state, or a missing or mismatched cookie → `UNAUTHENTICATED`.
2. **Handle denial.** If Google sent `error` (e.g. `access_denied`) instead of `code` → `GMAIL_NOT_CONNECTED` with `reason=<Google error>`. A missing `code` → `VALIDATION_FAILED`.
3. **Exchange the code** with `exchangeAuthorizationCode` (`OAuth2Client.getToken`), then call `getTokenInfo(tokens.access_token)`.
   - `sub` and `email` come from token info.
   - `name` comes from the `name` claim of the exchange's `id_token`. That token is read without a signature check, because it came straight from Google's token endpoint over TLS (OpenID Connect Core §3.1.3.7). A missing claim gives `name = null` and doesn't fail the sign-in.
   - `invalid_grant` (expired or reused code) → `GMAIL_TOKEN_REVOKED`.
4. **Check the grant**, before any sign-in or write. Each failure → `GMAIL_NOT_CONNECTED`, with the `reason`:
   - no refresh token: `no_refresh_token`;
   - no `email` or `sub` in token info: `missing_email_scope`;
   - no `id_token`: `missing_openid_scope`;
   - `gmail.modify` or `gmail.send` missing: `missing_gmail_scope`.
5. **Sign in to Supabase** with `auth.signInWithIdToken({ provider: 'google', token: id_token, access_token })`.
   - Supabase verifies the token and creates the user on first sign-in.
   - It runs on a fresh, throwaway client, never the shared service-role client, because signing in stores the user's session on the client.
   - A rejection → `INTERNAL` with `reason=SUPABASE_SIGN_IN_FAILED`. The Supabase message is logged.
   - The Supabase user's email must equal token info's `email` (case-insensitive); otherwise → `VALIDATION_FAILED` with `reason=EMAIL_MISMATCH`.
6. **Upsert** `users` on conflict `google_id` (linking rules in §5.2), with:
   - `google_id` (token-info `sub`), `user_id` (the Supabase user's `id`), `email` (token-info `email`) and `name` (id_token `name`);
   - `refresh_token`, `scopes`, and `access_token` / `access_token_expires_at` as a pair (§3.1).

   Reset `history_id` to `null` on re-sign-in; this forces a full sync. Linking conflicts → `VALIDATION_FAILED` with `reason=GOOGLE_ACCOUNT_LINKED_ELSEWHERE` or `ANOTHER_GOOGLE_ACCOUNT_LINKED`.
7. Call `MailProvider.watch()` (§4.5). If it fails, the failure is logged; it doesn't fail the sign-in.
8. Run the initial **full sync** (§3.5). If it fails, the failure is logged and `initialSync=failed`. `history_id` then stays `null`, so the next push notification runs the full sync instead.

If a step after 5 fails, the redirect carries the error and no session. The Supabase user may already exist by then; signing in again retries the connect.

**Error codes** (in the redirect's `code` parameter): `UNAUTHENTICATED`, `VALIDATION_FAILED`, `GMAIL_TOKEN_REVOKED`, `GMAIL_NOT_CONNECTED`, `GMAIL_RATE_LIMITED`, `GMAIL_UPSTREAM_ERROR`, `INTERNAL`.

If the configuration itself is missing (e.g. `FRONTEND_URL`), the callback answers `500 CONFIG_ERROR` with the §3.3 envelope instead of redirecting. Any method other than `GET` → `405 METHOD_NOT_ALLOWED` (envelope, `Allow: GET`).

---

### 4.2 Message list — `GET /api/v1/messages`

Returns the user's stored messages from the DB, newest first. This endpoint **never calls Gmail**: the DB is kept current by push (§4.5).

*Changed in v1.1:* the list covers every stored message, not only INBOX ones: messages archived or trashed after they were stored, and messages sent through §4.3. It still holds only what the engine has stored (§3.5), never the whole mailbox.

*Changed in v1.2:* the `label` filter (below) selects among them on the server. Without it the list is `all`: every stored message except `trash` and `spam`.

**Request**

```ts
// Query string
interface ListMessagesQuery {
  limit?: number;   // integer 1..100, default 25
  cursor?: string;  // opaque; value of a previous response's nextCursor
  label?: string;   // Changed in v1.2: 'all' (default) | 'starred' | 'archive' | 'trash' | a custom label ID
}
```

**Filter** (*Changed in v1.2*). `label` selects which stored rows the list returns:

| `label` | Rows where |
|---|---|
| `all` (also when absent) | `status` is not `trash` and not `spam` |
| `starred` | `is_starred` and `status` is not `trash` or `spam` |
| `archive` | `status = 'archived'` |
| `trash` | `status = 'trash'` |
| a custom label ID | `label_ids` contains it and `status` is not `trash` or `spam` |

- `label` must be one of the four keywords, or a custom Gmail label ID matching `^Label_[A-Za-z0-9_-]+$`. System label IDs (`INBOX`, `UNREAD`, …) and an empty value are rejected.
- A cursor is only meaningful with the `label` it was issued for: the client resends the same `label` with every page. The cursor itself does not carry the label.

**Behavior**

1. Authenticate (§3.1), then load `users` for the user.
2. **Query:** select rows `WHERE user_id = $userId` (`$userId` from the verified token) that match the filter, ordered by `(internal_date DESC, gmail_id DESC)`, using keyset pagination from the cursor and `limit + 1` rows to compute `nextCursor`.

**Cursor:** `base64url(JSON.stringify({ d: internalDateISO, g: gmailId }))`. Clients treat it as opaque.

**Response — `200 OK`**

```ts
interface ListMessagesResponse {
  messages: MessageDTO[];      // length <= limit
  nextCursor: string | null;   // null when there are no more rows
  lastSyncedAt: string | null; // ISO-8601, users.last_synced_at; null if no sync has completed yet
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row, or `refresh_token` is `null` (never connected, or revoked). |
| `VALIDATION_FAILED` | 400 | `limit` not an integer in 1..100, `cursor` fails to decode or has the wrong shape, or `label` is not one of the allowed values (v1.2). |
| `INTERNAL` | 500 | DB error or an unexpected exception. |

---

### 4.3 Message send — `POST /api/v1/messages/send`

Sends a plain-text message through Gmail, optionally into an existing thread and, *from v1.3*, with uploaded attachments (§4.14), then stores the sent message. Implemented in `src/send/index.ts`.

**Request** — `Content-Type: application/json`

```ts
interface SendMessageRequest {
  to: string | string[];  // one address or a list; >= 1, <= 100
  subject: string;        // may be ""; max 998 chars, no CR/LF
  body: string;           // plain text (text/plain; charset=UTF-8)
  threadId?: string;      // a Gmail thread ID in this user's mailbox, passed to Gmail as-is
  attachmentIds?: string[]; // Added in v1.3: IDs from §4.14; at most 20, each a UUID, no duplicates
}
```

Validation rules (`VALIDATION_FAILED` with `details.issues` listing every failure):

- Every address is a valid RFC 5322 addr-spec, or `Name <addr-spec>`, with no CR/LF.
- `subject` contains no CR or LF (header injection) and is at most 998 characters.
- `body` is a string. An empty body is allowed.
- `threadId`, when present, is a non-empty string of letters and digits.
- *Added in v1.3:* `attachmentIds`, when present, is an array of at most 20 distinct UUIDs (issues on `attachmentIds` or `attachmentIds[i]`).

**Behavior**

1. Authenticate (§3.1), then load the user's credentials and account email from `users`.
   - *Added in v1.3, when `attachmentIds` is non-empty:* before any Gmail call, load the user's `attachments` rows for those IDs (filtered on `user_id`, §5.3) and read each Storage object at its `storage_path` with the service role.
     - An ID with no row for this user (unknown, or another user's) → `VALIDATION_FAILED`, issue `attachmentIds[i]` "unknown attachment".
     - A row whose object doesn't exist yet → `VALIDATION_FAILED`, issue `attachmentIds[i]` "not uploaded yet".
     - The sum of the **stored** objects' sizes over 26,214,400 bytes → `FILE_TOO_LARGE` with `details: { maxBytes: 26214400, totalBytes }`. The declared `size` of §4.14 is not used. Objects are read one at a time, in order, and reading stops as soon as the running total passes the limit, so `totalBytes` counts the files read up to that point (the server never holds more than about 50 MB).
     - All of these fail before anything is sent.
2. Build an RFC 2822 message (`src/providers/gmail/mime.ts`, behind `MailProvider.sendMessage`):
   - Headers: `From: <users.email>`, `To`, `Subject`, `Date`, `MIME-Version: 1.0`.
   - The subject is RFC 2047-encoded when it isn't ASCII.
   - The body is a single `text/plain; charset=UTF-8` part, base64 content-transfer-encoded.
   - Lines end in CRLF.
   - *Added in v1.3, with attachments:* the message is `multipart/mixed`: the text part first, then one part per attachment, in `attachmentIds` order, with `Content-Type` the stored object's content type (`application/octet-stream` when it has none), `Content-Disposition: attachment` with the row's `filename` (RFC 2231 `filename*=UTF-8''…` when it isn't ASCII), base64 content-transfer-encoded.
3. Call `users.messages.send({ userId: 'me', requestBody: { raw: base64url(mime), threadId? } })`.
   - *Added in v1.3, with attachments:* the message is sent by media upload instead (`media: { mimeType: 'message/rfc822', body: mime }`, `requestBody: { threadId? }`), which Gmail accepts up to 35 MB; base64 makes 25 MB of attachments about 34 MB.
   - `threadId` is passed through unchanged. No `In-Reply-To` / `References` headers are derived and the subject is not rewritten.
   - Gmail itself files the message in that thread, but recipients' mail clients may not thread it unless the subject matches.
4. `messages.send` returns only `id`, `threadId` and `labelIds`. So call `users.messages.get({ id, format: 'full' })`, normalize it with the same parser as sync (§5.1), and upsert the row on `(user_id, gmail_id)`.

**Response — `201 Created`**

```ts
interface SendMessageResponse {
  message: MessageDTO;   // the sent message (labelIds includes "SENT")
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token. |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `VALIDATION_FAILED` | 400 | Body is not JSON, or it fails any rule above (`details.issues` lists them). |
| `MESSAGE_NOT_FOUND` | 404 | Gmail rejected `threadId` as not found in this mailbox (`details: { threadId }`). |
| `FILE_TOO_LARGE` | 413 | *v1.3:* the attachments are over 25 MB together (`details: { maxBytes, totalBytes }`). |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail send/get returned 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | DB error, a Storage read failure, or an unexpected exception. |

Uploaded attachments are kept after the message is sent (§4.14, Known limits).

If `send` succeeds but the follow-up `get` or upsert fails, the endpoint still returns an error (`GMAIL_UPSTREAM_ERROR` or `INTERNAL`) with `details: { sentGmailId }`, so that the client does not resend. The next sync will pick up the message.

---

### 4.4 Mark as read — `POST /api/v1/messages/{id}/read`

**Request**

```ts
// Path param
interface MarkReadParams {
  id: string;   // gmailId
}
// No body.
```

**Behavior**

1. Authenticate, then load `users`.
2. Load the row `(user_id, gmail_id = id)`. If it is missing → `MESSAGE_NOT_FOUND`.
3. Call `users.messages.modify({ id, requestBody: { removeLabelIds: ['UNREAD'] } })`. This is idempotent in Gmail.
4. Update `label_ids` from the modify response's `labelIds`, set `is_read = true`, recompute `status` (§3.4), and set `synced_at = now()`.

**Response — `200 OK`** (also returned when the message was already read)

```ts
interface MarkReadResponse {
  message: MessageDTO;   // isRead === true
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token. |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `MESSAGE_NOT_FOUND` | 404 | No row for this user and ID, or Gmail `modify` returned 404. In the Gmail 404 case the stale row is deleted. |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | DB error or an unexpected exception. |

---

### 4.5 Gmail push webhook — `POST /webhook/gmail`

Public path `/webhook/gmail`, outside `/api/v1`. The handler is `api/webhook/gmail.ts`; *changed in v1.2*, the Next.js route `app/webhook/gmail/route.ts` serves it at that path directly (one project serves the frontend and every endpoint), so no rewrite is needed.

The Pub/Sub push subscription endpoint is `https://<host>/webhook/gmail`.

Receives Gmail change notifications from a Cloud Pub/Sub **push** subscription and applies the delta to the DB. Only Pub/Sub calls this endpoint; it is not user-facing.

**Prerequisites (deployment config, env)**

- `GOOGLE_PUBSUB_TOPIC`: a Pub/Sub topic (`projects/<p>/topics/<t>`) with publish rights granted to `gmail-api-push@system.gserviceaccount.com`.
- `GOOGLE_PUBSUB_VERIFICATION_TOKEN`: a random string of at least 32 characters, shared with Pub/Sub through the push URL.
- A push subscription whose endpoint is `https://<host>/webhook/gmail?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`.

**Watch registration and renewal**

- `MailProvider.watch()` calls `users.watch({ topicName: GOOGLE_PUBSUB_TOPIC, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' })`. It stores the response's `expiration` in `users.watch_expiration`.
- It is called:
  - at the end of a successful OAuth callback (§4.1), so a new account receives push immediately;
  - once a day for every connected account, by the cron job in §4.6.
- Gmail requires renewal at least every 7 days and recommends once a day. User requests (§4.2–§4.4) never call `watch()`.

**Request** — `Content-Type: application/json`

The request URL carries `?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`. Its body:

```ts
interface PubSubPushBody {
  message: {
    data: string;          // base64url JSON: { emailAddress: string; historyId: string }
    messageId: string;     // Pub/Sub ID, unrelated to Gmail message IDs
    publishTime: string;
  };
  subscription: string;
}
```

**Behavior**

1. **Verify the shared token.**
   - If `GOOGLE_PUBSUB_VERIFICATION_TOKEN` is unset or empty → `500 INTERNAL` (fail closed).
   - Compare the `token` query parameter to it in constant time (`crypto.timingSafeEqual` on equal-length buffers). If it is missing or doesn't match → `UNAUTHENTICATED`.
   - There is no bypass. A local replay simply sends the same `?token=` from `.env`.
   - Known limit: the token sits in the URL, so it can appear in access logs. Rotate it by updating the env var and the subscription endpoint together.
2. Decode `message.data` (base64 JSON) into `{ emailAddress, historyId }`. If it fails → `VALIDATION_FAILED`.
3. **Ack immediately.** Return `200` with an empty body, and hand steps 4–6 to `waitUntil` from `@vercel/functions`. That keeps the function alive after the response, up to the function's `maxDuration`. Everything after the ack is background work:
   - **Failures are logged and never retried by Pub/Sub**, because it has already been acked.
   - Nothing is lost: the next notification catches up, because every sync starts from the **stored** `history_id`.
   - Outside Vercel (tests, `vercel dev`), `waitUntil` is a no-op and the promise simply runs to completion.
4. Look up `users` by `email = emailAddress` (`findAccountByEmailUnscoped`). If there is no row, or no refresh token, stop with no Gmail call.
5. **Delta rule:**
   - If `historyId` ≤ `history_id` (compared as unsigned 64-bit integers via `BigInt`), the notification is a duplicate or arrived out of order → stop, no Gmail call.
   - If the stored `history_id` is `null` (the initial sync at connect failed), run a full sync (§3.5).
   - Otherwise run the incremental sync (§3.5) starting from the **stored** `history_id`, never from the notification's `historyId`. The notification's ID is the mailbox's *new* state and is used only as the "is there anything newer?" test.
   - The 404 fallback to full sync applies here too.
   - The saved `history_id` is the `historyId` of the **last `history.list` page**, saved only after every change was applied, never the notification's.
6. `history_id` only ever advances: `UPDATE … SET history_id = $new WHERE history_id IS NULL OR history_id::numeric < $new::numeric`. This makes concurrent syncs (webhook and list) safe. Each sync runs under `pg_advisory_xact_lock(hashtext(user_id::text))`.

**Response**

| Outcome | Status | Body |
|---|---|---|
| Valid token and body (acked; sync runs in the background) | `200 OK` | empty |
| Error | per table below | §3.3 envelope |

Only failures detected **before** the ack return non-2xx. Pub/Sub retries those, and they usually need a configuration fix.

**Errors** (before the ack only)

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or wrong `token` query parameter. |
| `VALIDATION_FAILED` | 400 | Body not JSON, or `message.data` does not decode to `{ emailAddress, historyId }`. |
| `INTERNAL` | 500 | `GOOGLE_PUBSUB_VERIFICATION_TOKEN` not configured. |

**Background failures**, logged and not returned:
- **Rate limits, Gmail errors and DB errors:** the sync stops without saving `history_id`, so the next notification retries the same delta.
- **`invalid_grant`:** the account's `refresh_token`, `access_token` and `access_token_expires_at` are set to `null`, so later user requests return `GMAIL_NOT_CONNECTED`.

---

### 4.6 Watch-renewal cron job — `GET /api/cron/renew-watch`

A Vercel Cron Job, run once a day, that renews the Gmail push watch (§4.5) for every connected account whose watch is missing, expired, or expires within 24 hours. Only Vercel's scheduler calls this endpoint; it is not user-facing.

**Configuration**

- Handler: `api/cron/renew-watch.ts`, with its logic in `src/cron/renewWatch.ts`, served by the Next.js route `app/api/cron/renew-watch/route.ts` (`maxDuration = 300`; *changed in v1.2*).
- `vercel.json`:

  ```json
  { "crons": [{ "path": "/api/cron/renew-watch", "schedule": "0 6 * * *" }] }
  ```

- Env: `CRON_SECRET`, a random string of at least 32 characters. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
- Vercel runs cron jobs against production deployments only. On a preview or locally, trigger the job by hand with `vercel crons run /api/cron/renew-watch`, or by sending the bearer header yourself.

**Request**

The request has no body and no query parameters. The only header that matters is `Authorization: Bearer <CRON_SECRET>`.

**Behavior**

1. **Authenticate.** If `CRON_SECRET` is unset or empty → `500 INTERNAL` (fail closed: the job never runs unauthenticated). If the header is missing or doesn't match (constant-time comparison) → `UNAUTHENTICATED`.
2. **Select accounts.** Using `listConnectedAccountsUnscoped({ watchExpiringBefore: now + 24 h })` (§5.3), select every `users` row with a non-null `refresh_token` where `watch_expiration` is null or earlier than `now + 24 h`. That covers watches that are expiring soon, already expired after a missed run, or never registered because `watch()` failed at connect.
3. **Renew.** For each account, call `MailProvider.watch()` (`users.watch` on `GOOGLE_PUBSUB_TOPIC`) and store the new `watch_expiration`. Gmail returns no resource ID, so none is stored. Calls run with a concurrency limit of 5. Failures are per account, never fatal for the run:
   - `invalid_grant`: clear `refresh_token`, `access_token` and `access_token_expires_at`, as in §4.5, and count the account as `revoked`.
   - Stored tokens that cannot be decrypted (§5.4): treated like `invalid_grant`.
   - Rate limit or other Gmail error: log it, count the account as `failed`, and leave the existing `watch_expiration` unchanged. The next daily run retries it. Because only watches with less than 24 h left are renewed, a single missed run can let a watch lapse. Push then stops until the next run renews it, and sync catches up from the stored `history_id` (§3.5).
4. **Respond** with the counts.

**Response — `200 OK`** (also returned when some accounts failed)

```ts
interface RenewWatchesResponse {
  renewed: number;
  revoked: number;
  failed: number;
  durationMs: number;
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or wrong `Authorization` bearer. |
| `INTERNAL` | 500 | `CRON_SECRET` not configured, or the account query fails. |

---

### 4.7 Update message labels — `PATCH /api/v1/messages/{id}` (*Added in v1.1*)

Changes one message's labels. This is how a client stars, unstars, marks unread, archives, moves to trash and restores. `status` changes only as a consequence (§3.4). Function file: `api/v1/messages/[id].ts`.

**Request** — `Content-Type: application/json`

```ts
// Path param: id = gmailId
interface UpdateLabelsRequest {
  addLabelIds?: string[];
  removeLabelIds?: string[];
}
```

| Client action | Body |
|---|---|
| Star / unstar | `{ addLabelIds: ['STARRED'] }` / `{ removeLabelIds: ['STARRED'] }` |
| Mark unread | `{ addLabelIds: ['UNREAD'] }` (mark as read stays §4.4) |
| Archive / move back to inbox | `{ removeLabelIds: ['INBOX'] }` / `{ addLabelIds: ['INBOX'] }` |
| Move to trash / restore | `{ addLabelIds: ['TRASH'] }` / `{ removeLabelIds: ['TRASH'] }` |
| Apply / remove a custom label | its Gmail label ID, e.g. `{ addLabelIds: ['Label_12'] }` |

Validation rules (`VALIDATION_FAILED` with `details.issues` listing every failure):

- At least one label across both arrays; at most 20 in each; every entry a non-empty string.
- No label appears in both arrays.
- `DRAFT`, `SENT`, `SPAM` and `CHAT` are rejected.
- `TRASH` must be the only label in the request.
- Any other key, including `status`, `isRead` and `isStarred`, is rejected.

**Behavior**

1. Authenticate, then load `users`.
2. Load the row `(user_id, gmail_id = id)`. If it is missing → `MESSAGE_NOT_FOUND`.
3. Call Gmail:
   - `TRASH` added → `users.messages.trash({ id })`;
   - `TRASH` removed → `users.messages.untrash({ id })`;
   - otherwise → `users.messages.modify({ id, requestBody: { addLabelIds, removeLabelIds } })`.

   Each is idempotent in Gmail.
4. Store the response's `labelIds` in `label_ids`, recompute `is_read`, `is_starred` and `status` (§3.4), and set `synced_at = now()`.

**Response — `200 OK`**

```ts
interface UpdateLabelsResponse {
  message: MessageDTO;
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No valid session. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token. |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `VALIDATION_FAILED` | 400 | Body is not JSON or fails a rule above, or Gmail rejected a label ID as invalid (`details: { labelIds }`). |
| `MESSAGE_NOT_FOUND` | 404 | No row for this user and ID, or Gmail returned 404. In the Gmail 404 case the stale row is deleted. |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | DB error or an unexpected exception. |

---

### 4.8 Thread view — `GET /api/v1/threads/{threadId}` (*Added in v1.1*)

Returns the stored messages of one thread, oldest first. This endpoint **never calls Gmail**, so a thread shows only the messages the engine has stored (§3.5); older replies outside the initial 50 may be missing. Function file: `api/v1/threads/[threadId].ts`.

**Request:** path param `threadId`, a non-empty string of letters and digits. No query, no body.

**Behavior**

1. Authenticate, then load `users`.
2. Select rows `WHERE user_id = $userId AND thread_id = $threadId`, every `status` included, ordered by `(internal_date ASC, gmail_id ASC)`. At most the **100 newest** are returned, still in ascending order.
3. Zero rows → `MESSAGE_NOT_FOUND` with `details: { threadId }`.

**Response — `200 OK`**

```ts
interface ThreadResponse {
  threadId: string;
  messages: MessageDTO[];   // length 1..100, oldest first
  truncated: boolean;       // true when older stored messages were left out
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row, or `refresh_token` is `null`. |
| `VALIDATION_FAILED` | 400 | `threadId` is empty or not letters and digits. |
| `MESSAGE_NOT_FOUND` | 404 | No stored message of this user has this `threadId`. |
| `INTERNAL` | 500 | DB error or an unexpected exception. |

---

### 4.9 Search — `GET /api/v1/messages/search` (*Added in v1.1*)

Searches the user's stored messages. This endpoint **never calls Gmail**: it searches only what §4.2 would list. Function file: `api/v1/messages/search.ts`.

**Request**

```ts
// Query string
interface SearchMessagesQuery {
  q: string;        // required; 2..200 characters after trimming
  limit?: number;   // integer 1..100, default 25
  cursor?: string;  // a previous response's nextCursor for the same q
}
```

**Behavior**

1. Authenticate, then load `users`.
2. Split `q` on whitespace into terms. A row matches when **every** term appears, case-insensitively, as a substring of at least one of `subject`, `from_address`, any `to_address` element, `snippet` or `body_plain`. `%`, `_` and `\` in terms are escaped, so they match literally.
3. Every `status` is included. Order, keyset pagination and cursor format are those of §4.2.

**Response — `200 OK`**

```ts
interface SearchMessagesResponse {
  messages: MessageDTO[];      // length <= limit
  nextCursor: string | null;
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row, or `refresh_token` is `null`. |
| `VALIDATION_FAILED` | 400 | `q` missing or outside 2..200 characters, `limit` invalid, or `cursor` fails to decode. |
| `INTERNAL` | 500 | DB error or an unexpected exception. |

---

### 4.10 Create draft — `POST /api/v1/drafts` (*Added in v1.1*)

Creates a Gmail draft. Drafts are not stored in the DB. Function file: `api/v1/drafts/index.ts`.

**Request:** `DraftRequest` (§3.7).

**Behavior**

1. Authenticate, then load the user's credentials and account email.
2. Build the RFC 2822 message as in §4.3 step 2. The `To` header is omitted when there are no recipients.
3. Call `users.drafts.create({ userId: 'me', requestBody: { message: { raw, threadId? } } })`. Gmail assigns the `draftId`.

**Response — `201 Created`**

```ts
interface DraftResponse {
  draft: DraftDTO;   // §3.7
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token. |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `VALIDATION_FAILED` | 400 | Body is not JSON or fails a §3.7 rule. |
| `MESSAGE_NOT_FOUND` | 404 | Gmail rejected `threadId` as not found (`details: { threadId }`). |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | An unexpected exception. |

---

### 4.11 Update draft — `PATCH /api/v1/drafts/{draftId}` (*Added in v1.1*)

Replaces a draft's content. Function file: `api/v1/drafts/[draftId].ts`.

**Request:** path param `draftId` (from a §4.10 or §4.11 response; a non-empty string of letters, digits, `-` and `_`), and a `DraftRequest` body (§3.7).

**Behavior**

1. Authenticate, then load the user's credentials and account email.
2. Build the message as in §4.10 and call `users.drafts.update({ userId: 'me', id: draftId, requestBody: { message: { raw, threadId? } } })`.
   - This is a **full replacement**: a field omitted from the body is reset to its §3.7 default.
   - The draft keeps its `draftId`; its `gmailId` changes.

**Response — `200 OK`:** `DraftResponse` (§4.10).

**Errors:** as §4.10, plus `VALIDATION_FAILED` for a malformed `draftId`, and `MESSAGE_NOT_FOUND` when Gmail does not know the `draftId` (`details: { draftId }`).

---

### 4.12 Delete draft — `DELETE /api/v1/drafts/{draftId}` (*Added in v1.1*)

Discards a draft. Function file: `api/v1/drafts/[draftId].ts`.

**Request:** path param `draftId` as in §4.11. No body.

**Behavior:** authenticate, then call `users.drafts.delete({ userId: 'me', id: draftId })`. Sending a draft is two calls: the client sends its content with §4.3, then deletes the draft here.

**Response — `204 No Content`**, empty body.

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token. |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `VALIDATION_FAILED` | 400 | Malformed `draftId`. |
| `MESSAGE_NOT_FOUND` | 404 | Gmail does not know the `draftId` (`details: { draftId }`). A client that is cleaning up may treat this as already done. |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | An unexpected exception. |

---

### 4.13 List drafts — `GET /api/v1/drafts` (*Added in v1.1*)

Lists the user's Gmail drafts. Drafts are not stored in the DB (§3.7), so this endpoint reads Gmail on every call. It is called when the user opens Drafts or asks to refresh them, and once when the client starts; never on a timer. Function file: `api/v1/drafts/index.ts` (beside §4.10's `POST`).

**Request**

```ts
// Query string
interface ListDraftsQuery {
  limit?: number;   // integer 1..50, default 25
  cursor?: string;  // opaque; value of a previous response's nextCursor
}
```

**Behavior**

1. Authenticate, then load the user's credentials.
2. Call `users.drafts.list({ userId: 'me', maxResults: limit, pageToken? })`, with `pageToken` decoded from `cursor`.
3. For each listed draft, call `users.drafts.get({ userId: 'me', id, format: 'full' })`, at most 10 at a time, and map it to a `DraftDTO` (§3.7):
   - `to` from the `To` header (empty when absent), `subject` from `Subject` (`""` when absent), `body` from the first `text/plain` part as in §5.1 `body_plain` (`""` when none);
   - `updatedAt` is the draft message's `internalDate`, which Gmail sets on every save.
4. A draft that returns 404 on `get` (deleted in between) is skipped; the page may then be shorter than `limit`.
5. Drafts keep Gmail's order (newest first).

**Cursor:** `base64url(JSON.stringify({ p: nextPageToken }))`. Unlike the DB-backed lists (§4.2), it wraps Gmail's page token rather than a keyset, because drafts are read from Gmail. Clients treat it as opaque.

**Response — `200 OK`**

```ts
interface ListDraftsResponse {
  drafts: DraftDTO[];          // length <= limit
  nextCursor: string | null;   // null when Gmail returns no nextPageToken
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token. |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `VALIDATION_FAILED` | 400 | `limit` not an integer in 1..50, `cursor` fails to decode, or Gmail rejects the page token as invalid (`details: { cursor }`). |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | An unexpected exception. |

### 4.14 Upload an attachment — `POST /api/v1/attachments` (*Added in v1.3*)

Reserves an attachment for the signed-in user and returns a short-lived signed URL. The browser then uploads the file **straight to Supabase Storage** with that URL. Function file: `src/endpoints/v1/attachments/index.ts`, served by `app/api/v1/attachments/route.ts`.

**Why the file doesn't pass through this endpoint.** Vercel Functions accept at most 4.5 MB of request body; a larger request is rejected with `413` before the handler runs. A multipart upload of a 25 MB file to a function is therefore impossible. This endpoint takes only the file's metadata (a few hundred bytes); the bytes go to Storage, which enforces the size limit itself.

Uploads are attached to a message by passing their IDs to send (§4.3). Drafts (§4.10, §4.11) don't carry attachments.

**Request:** JSON body.

```ts
interface AttachmentUploadRequest {
  filename: string;   // 1..255 characters after trimming; no '/', '\' or control characters
  mimeType: string;   // 'type/subtype', e.g. 'application/pdf'; parameters (';charset=…') are not allowed
  size: number;       // integer bytes, 1..26214400 (25 MB = 25 × 1024 × 1024)
}
```

**Limit: 25 MB per file** (26,214,400 bytes), Gmail's attachment limit. It is enforced twice:
- here, on the declared `size` → `FILE_TOO_LARGE` before anything is reserved;
- by the Storage bucket's `file_size_limit` (§5.5), on the bytes actually uploaded. The client can't get round the limit by declaring a smaller `size`.

The declared `size` and `mimeType` are informational. Send (§4.3) uses the stored object's real size and type from Storage, not these values.

**Behavior**

1. Authenticate (§3.1). Gmail is not involved: the account doesn't need to be connected, and no Gmail call is made.
2. Validate the body. The first failing field is reported as `VALIDATION_FAILED` with `details: { field }`. A `size` over 26,214,400 is `FILE_TOO_LARGE` with `details: { maxBytes: 26214400, size }`.
3. Generate `attachmentId` (a UUID) and insert the `attachments` row (§5.5) with `user_id` from the token, the trimmed `filename`, `mimeType`, `size` and `storage_path = '{user_id}/{attachmentId}'`.
4. Create a signed upload URL for that path in the private `attachments` bucket, with the service-role client (`storage.from('attachments').createSignedUploadUrl(storagePath)`). It is valid for 2 hours (Supabase's fixed lifetime) and for that one path only.
   - If this fails, the row from step 3 is deleted and the request fails `INTERNAL`.

**Response — `201 Created`**

```ts
interface AttachmentUploadResponse {
  attachment: {
    attachmentId: string;   // opaque; the client keeps it to reference the upload later
    filename: string;
    mimeType: string;
    size: number;           // as declared
    createdAt: string;      // ISO 8601
  };
  upload: {
    url: string;                       // signed Supabase Storage URL, single path, single use
    method: 'PUT';
    headers: Record<string, string>;   // send exactly these; includes 'Content-Type': mimeType
    expiresAt: string;                 // ISO 8601, 2 h after the reservation
  };
}
```

**Client upload.** The client sends `PUT upload.url` with the raw file bytes as the body (not multipart) and exactly `upload.headers`. Storage answers `200` when the object is stored. It refuses a body over the bucket limit (`413`), an expired or reused URL, and a second upload to the same path. The client then reserves again; the earlier reservation is simply never used.

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `VALIDATION_FAILED` | 400 | Body is not JSON, or `filename`, `mimeType` or `size` fails a rule above (`details: { field }`). |
| `FILE_TOO_LARGE` | 413 | `size` is over 26,214,400 bytes (`details: { maxBytes: 26214400, size }`). |
| `INTERNAL` | 500 | The DB insert or the signed-URL request failed, or an unexpected exception. |

`FILE_TOO_LARGE` is new in v1.3 (§3.3). As on the other `/api/v1` endpoints, a method other than `POST` or the CORS `OPTIONS` preflight gets a plain `405`, not `METHOD_NOT_ALLOWED` (that code is for §4.1). Errors from the upload itself come from Storage, not from this API, and don't use the §3.3 envelope.

**Known limits (v1.3)**

- **No clean-up.** Reservations that are never uploaded, and uploads that are never used, are kept. Removing them needs a scheduled job, which is out of scope (§1). Deleting a user removes their `attachments` rows (FK cascade), but **not** their Storage objects, which have no foreign key; those stay until removed by hand under `{user_id}/`.
- **No quota.** There is no per-user limit on the number or total size of uploads.
- **No download of uploads.** There is no endpoint to read an upload back. Once sent, a file can be downloaded from the sent message like any attachment (§4.15).
- **Kept after sending.** Sending (§4.3) leaves the row and the object in place.

---

### 4.15 Download an attachment — `GET /api/v1/messages/{id}/attachments/{partId}` (*Added in v1.3*)

Returns a short-lived signed URL that downloads one attachment of a stored message, received or sent. Like the draft list (§4.13), it reads Gmail **on request**: only when the user asks for that file, never on a timer. Function file: `src/endpoints/v1/messages/[id]/attachments/[partId].ts`, served by `app/api/v1/messages/[id]/attachments/[partId]/route.ts`.

**Why a URL and not the file.** Vercel Functions return at most 4.5 MB of response body, and Gmail attachments go up to 25 MB here. So the engine copies the file into the private Storage bucket (§5.5) and hands the browser a signed URL to fetch it from Storage directly.

**Request:** path parameters only.

- `id`: the message's `gmailId` (letters and digits).
- `partId`: the attachment's `partId` from `MessageDTO.attachments` (§3.4), digits and dots, e.g. `1` or `0.2`.

**Behavior**

1. Authenticate (§3.1). Validate `id` and `partId` (`VALIDATION_FAILED`, issue on that field).
2. Load the stored message for this user (`user_id` filter, §5.3). No row, or no entry in its `attachments` with that `partId` → `MESSAGE_NOT_FOUND` with `details: { partId }` when the message exists. No Gmail call.
3. An entry whose `size` is over 26,214,400 bytes → `FILE_TOO_LARGE` with `details: { maxBytes: 26214400, size }`. Gmail accepts incoming mail up to 50 MB, but the bucket holds at most 25 MB per object. No Gmail call.
4. The copy lives at `{user_id}/received/{gmailId}/{partId}` in the `attachments` bucket. If it is already there, skip to step 6.
5. Read the file from Gmail: `users.messages.get({ id, format: 'full' })`, find the part with that `partId`, then `users.messages.attachments.get({ messageId: id, id: <the part's current body.attachmentId> })`. The attachment ID is looked up fresh because Gmail does not keep it stable between fetches. A part with its data inline (`body.data`) uses that instead. Store the decoded bytes at the path above with the entry's `mimeType`.
   - Gmail answers 404, or the part is gone → `MESSAGE_NOT_FOUND` (`details: { partId }`).
6. Create a signed download URL for that object, valid for **5 minutes**, that makes the browser save it under the entry's `filename` (`Content-Disposition: attachment`).

**Response — `200 OK`**

```ts
interface AttachmentDownloadResponse {
  url: string;        // signed Supabase Storage URL; GET it within expiresAt
  expiresAt: string;  // ISO 8601, 5 minutes after the response
  filename: string;
  mimeType: string;
  size: number;       // from the stored metadata
}
```

**Errors**

| Code | HTTP | Trigger |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid bearer token. |
| `VALIDATION_FAILED` | 400 | `id` or `partId` is malformed (`details.issues`). |
| `MESSAGE_NOT_FOUND` | 404 | No such stored message for this user, no such attachment on it, or Gmail no longer has it. |
| `FILE_TOO_LARGE` | 413 | The attachment is over 25 MB (`details: { maxBytes, size }`). The client points to View in Gmail. |
| `GMAIL_NOT_CONNECTED` | 409 | No `users` row or refresh token (only when Gmail has to be read). |
| `GMAIL_TOKEN_REVOKED` | 401 | `invalid_grant`. |
| `GMAIL_RATE_LIMITED` | 429 | Gmail rate limit. |
| `GMAIL_UPSTREAM_ERROR` | 502 | Gmail 5xx or an unexpected 4xx. |
| `INTERNAL` | 500 | A DB or Storage error, or an unexpected exception. |

**Known limits:** the Storage copy is kept after the download, so a later download of the same file reads no Gmail; like uploads, copies are never cleaned up and are not removed when the user is deleted (§4.14). The signed URL works for anyone holding it until it expires.

---

## 5. Data model

### 5.1 `messages` — one stored message

Source is the Gmail `users.messages.get` response with `format=full` (the `Message` resource, referred to below as `m`).

| Column | Postgres type | TS type | Nullable | Source |
|---|---|---|---|---|
| `id` | `uuid` PK, `default gen_random_uuid()` | `string` | no | Generated |
| `user_id` | `uuid` FK → `auth.users(id)` on delete cascade | `string` | no | `sub` claim of the verified bearer token (§3.1) |
| `gmail_id` | `text` | `string` | no | `m.id` |
| `thread_id` | `text` | `string` | no | `m.threadId` |
| `label_ids` | `text[]` | `string[]` | no (default `{}`) | `m.labelIds` (absent → `[]`) |
| `is_read` | `boolean` | `boolean` | no | Derived: `!m.labelIds.includes('UNREAD')` |
| `is_starred` | `boolean` | `boolean` | no | Derived: `m.labelIds.includes('STARRED')` |
| `status` | `text` | `MessageStatus` | no | *Added in v1.1.* Derived from `label_ids` by the §3.4 rule, on every write of `label_ids` |
| `snippet` | `text` | `string` | no (default `''`) | `m.snippet` |
| `history_id` | `text` | `string` | no | `m.historyId` (uint64, stored as text to avoid precision loss) |
| `internal_date` | `timestamptz` | `string` (ISO) | no | `m.internalDate` (epoch-ms string → `new Date(Number(v))`) |
| `size_estimate` | `integer` | `number` | no | `m.sizeEstimate` |
| `subject` | `text` | `string \| null` | yes | `m.payload.headers[name="Subject"].value` |
| `from_address` | `text` | `string` | no (default `''`) | `m.payload.headers[name="From"].value` (raw, e.g. `Ada <ada@x.io>`) |
| `to_address` | `text[]` | `string[]` | no (default `{}`) | `m.payload.headers[name="To"].value`, split into addresses. Named singular, but an array, because a message can have several recipients |
| `cc_addresses` | `text[]` | `string[]` | no (default `{}`) | `m.payload.headers[name="Cc"].value`, split |
| `bcc_addresses` | `text[]` | `string[]` | no (default `{}`) | `m.payload.headers[name="Bcc"].value`, split (present on sent mail only) |
| `rfc822_message_id` | `text` | `string \| null` | yes | `m.payload.headers[name="Message-ID"].value` |
| `in_reply_to` | `text` | `string \| null` | yes | `m.payload.headers[name="In-Reply-To"].value` |
| `references` | `text` | `string \| null` | yes | `m.payload.headers[name="References"].value` |
| `date_header` | `text` | `string \| null` | yes | `m.payload.headers[name="Date"].value` (raw, unparsed) |
| `body_plain` | `text` | `string \| null` | yes | First part (depth-first) with `mimeType = "text/plain"` and no `filename`: `body.data`, base64url-decoded as UTF-8. A single-part message (no `payload.parts`) uses `payload.body.data`, by `payload.mimeType` |
| `body_html` | `text` | `string \| null` | yes | First part (depth-first) with `mimeType = "text/html"` and no `filename`: `body.data`, base64url-decoded as UTF-8 |
| `attachments` | `jsonb` | `AttachmentMeta[]` | no (default `[]`) | Every part with a non-empty `filename` and `body.attachmentId`: `{ partId: part.partId, filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId }` |
| `synced_at` | `timestamptz` | `string` | no | Server time of the last write from Gmail |
| `created_at` | `timestamptz` default `now()` | `string` | no | Server time |
| `updated_at` | `timestamptz` default `now()` | `string` | no | Server time (trigger on update) |

Parsing rules:

- Header lookup is case-insensitive on `name`. If a header repeats, the first occurrence wins.
- MIME parts are walked recursively through `payload.parts`. A single-part message carries its body directly in `payload.body.data`.

Constraints and indexes:

- `UNIQUE (user_id, gmail_id)`. This is the upsert conflict target.
- `INDEX (user_id, internal_date DESC, gmail_id DESC)`, used for list pagination.
- *Added in v1.1:* `CHECK (status IN ('inbox','sent','archived','trash','spam'))`, and `INDEX (user_id, thread_id, internal_date)` for the thread view (§4.8). The schema session may add an index for search (§4.9), e.g. `pg_trgm`.
- RLS enabled with **no policies**. That denies all access through the anon and authenticated roles: the Data API is closed to clients, and only the service role, which bypasses RLS, can read or write. This is defence in depth; isolation itself is §5.3.

### 5.2 `users` — one connected Google account per user

| Column | Postgres type | Nullable | Source |
|---|---|---|---|
| `google_id` | `text` PK | no | Token-info `sub` of the connected Google account (§4.1). This is the upsert conflict target |
| `user_id` | `uuid` `UNIQUE`, FK → `auth.users(id)` on delete cascade | no | `id` of the Supabase user returned by `signInWithIdToken` (§4.1b step 5) |
| `email` | `text` `UNIQUE` | no | Token-info `email` from the §4.1b exchange. It must match the Supabase user's email, case-insensitively |
| `name` | `text` | yes | The `name` claim of the §4.1b exchange's `id_token` (needs the `userinfo.profile` scope); `null` when absent |
| `refresh_token` | `text`: ciphertext (§5.4) | yes | `refresh_token` from the §4.1b code exchange (or Google's rotated one later); `null` after revocation (§4.5, §4.6) |
| `scopes` | `text[]` | no | Granted scopes from token info |
| `access_token` | `text`: ciphertext (§5.4) | yes | §4.1b: the code exchange's `access_token`. Afterwards: `tokens.access_token` from the `'tokens'` event |
| `access_token_expires_at` | `timestamptz` | yes | §4.1b: the code exchange's `expiry_date`. Afterwards: `tokens.expiry_date` (epoch ms) from the `'tokens'` event |
| `history_id` | `text` | yes | Max `historyId` after the last successful sync; `null` forces a full sync |
| `last_synced_at` | `timestamptz` | yes | Server time |
| `watch_expiration` | `timestamptz` | yes | `users.watch` response `expiration` (epoch-ms string); `null` means no active watch. Gmail's watch returns no resource ID, so none is stored |
| `created_at` / `updated_at` | `timestamptz` | no | Server time |

RLS is the same as `messages` (enabled, no policies). Neither `refresh_token` nor `access_token` is ever returned by any endpoint.

`CHECK ((access_token IS NULL) = (access_token_expires_at IS NULL))` enforces the pairing rule from §3.1.

**Linking rules.** The table is keyed by `google_id`, and every user-scoped query still filters on `user_id` (§5.3).
- **Connect upsert.** `INSERT … ON CONFLICT (google_id) DO UPDATE SET … WHERE users.user_id = EXCLUDED.user_id`.
  - If it affects zero rows, the Google account is already linked to a different VibeMail user → `VALIDATION_FAILED` with `details: { reason: 'GOOGLE_ACCOUNT_LINKED_ELSEWHERE' }`.
  - If the insert violates `UNIQUE (user_id)`, this user already has a different Google account connected → `VALIDATION_FAILED` with `details: { reason: 'ANOTHER_GOOGLE_ACCOUNT_LINKED' }`. Multiple or switched accounts are out of scope (§1).
- **Lookups by email.** `UNIQUE (email)` lets the webhook find accounts by email. The webhook and the cron job look accounts up without a user (by email, or all of them). These are the only queries allowed to omit the `user_id` filter (§5.3).

### 5.3 Tenant isolation

Every query runs as the service role, so RLS does not protect user data. The rules below do.

- All SQL lives in the repository layer (`src/db`). Function code never builds queries.
- Every repository function that touches `messages`, `users` or, *from v1.3*, `attachments` on behalf of a user takes `userId: string` as a required parameter, and puts `user_id = $userId` in every `SELECT`, `UPDATE` and `DELETE`. Upserts filter on it too: `messages` conflicts on `(user_id, gmail_id)`, and `users` conflicts on `google_id` with the `WHERE users.user_id = EXCLUDED.user_id` guard (§5.2).
- `userId` comes only from the verified token's `sub` (§3.1). It is never read from the request body, query string or path.
- Exactly two functions may query without a `user_id` filter, and their names say so:
  - `findAccountByEmailUnscoped(email)`, for the webhook (§4.5);
  - `listConnectedAccountsUnscoped({ watchExpiringBefore })`, for the cron job (§4.6).
- *Added in v1.3:* every Storage object path starts with the owner's `user_id`, built only from the token's `sub` and server-side values, never from client input such as `filename`: `{user_id}/{attachmentId}` for uploads (a server-generated ID), and `{user_id}/received/{gmailId}/{partId}` for downloaded copies (§4.15; both taken from the user's own stored row after validation). Signed URLs are created for one path at a time.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and never logged or returned.

### 5.4 Token encryption

OAuth tokens are encrypted in application code before they reach the database. They are never stored in plaintext.

- **Algorithm:** AES-256-GCM via Node `crypto`.
- **Key:** `ENCRYPTION_KEY`, 32 random bytes encoded as base64. Startup fails if it doesn't decode to exactly 32 bytes.
- **Stored form:** `v1:<iv b64>:<authTag b64>:<ciphertext b64>`, with a fresh 12-byte IV per write. The `v1` prefix allows key rotation later.
- **Columns:** `users.refresh_token` and `users.access_token`. Only `src/db/` encrypts and decrypts, and plaintext tokens never leave the server process.
- **Integrity:** a decryption failure (wrong key, or a tampered value) is treated as revoked: `GMAIL_TOKEN_REVOKED`.

### 5.5 `attachments` — one uploaded file (*Added in v1.3*)

One row per reservation from §4.14. The file itself lives in Supabase Storage, not in Postgres.

| Column | Postgres type | Nullable | Source |
|---|---|---|---|
| `id` | `uuid` PK | no | Generated by the server in §4.14 step 3; returned as `attachmentId` |
| `user_id` | `uuid` FK → `auth.users(id)` on delete cascade | no | `sub` claim of the verified bearer token (§3.1) |
| `filename` | `text` | no | Request `filename`, trimmed; `CHECK (char_length(filename) BETWEEN 1 AND 255)` |
| `mime_type` | `text` | no | Request `mimeType` |
| `size_bytes` | `integer` | no | Request `size` (declared); `CHECK (size_bytes BETWEEN 1 AND 26214400)` |
| `storage_path` | `text` `UNIQUE` | no | `'{user_id}/{id}'` in the `attachments` bucket |
| `created_at` | `timestamptz` default `now()` | no | Server time |

- `INDEX (user_id, created_at DESC)`.
- RLS is the same as `messages` (enabled, no policies).
- Whether the file was actually uploaded is not stored: it is the presence of the Storage object at `storage_path`.

**Storage bucket `attachments`.** Created by the schema session's migration, like the tables (§6).
- Private (`public = false`): no public URLs, and the anon and authenticated roles get no Storage policies. Uploads use the signed URLs from §4.14; any later read goes through the service role.
- `file_size_limit = 26214400` (25 MB). Storage rejects a larger upload whatever `size` was declared.
- No `allowed_mime_types` restriction.
- *§4.15:* downloaded copies of message attachments live under `{user_id}/received/{gmailId}/{partId}`, with no row in `attachments`.
- Objects are **not** removed when the user or the row is deleted (§4.14, Known limits).

---

## 6. Sequencing rule — two-session build

**Rule: the schema session cannot be merged until the server-logic tests pass, i.e. `npm test` (= `jest --ci --runInBand`) exits 0.**

### Ownership

| Session | Branch | Owns (may write) | Must not write |
|---|---|---|---|
| Server logic | `main` | `src/` except `src/types/` (this includes `src/db/`), `tests/`, `vercel.json`, `package.json` | `supabase/migrations/`, `src/types/` |
| Schema | `schema` | `supabase/migrations/`, `src/types/` (DB row types and the §3.4 DTOs) | Everything else, **in particular `src/db/`** |

`supabase/migrations/` is the only directory the Supabase CLI applies, so that is where migrations live. With the Supabase GitHub integration enabled, merging to `main` runs them against production, which is why merging is gated.

### Order

1. **Schema session (draft).** On `schema`, write `supabase/migrations/<timestamp>_vibemail.sql` and `src/types/` implementing §5 and §3.4 exactly. Commit and push `schema`, but do **not** merge it or review it. It may be applied to the dev/test project in `.env`, which the integration tests need. It must not be applied to the production project.
2. **Server session.** On `main`, build every unit of BUILD_SEQUENCE.md. Code imports types from `src/types/`. Because those files live only on `schema` until the merge, `main` on its own is not expected to typecheck. All verification runs on the integration check below.
3. **Gate 1, the integration check.** In a throwaway worktree, merge `schema` into `main` without pushing:

   ```bash
   git worktree add ../vibemail-gate main
   cd ../vibemail-gate
   git merge --no-ff --no-edit schema
   # the dev/test project in .env must already have schema's migration applied
   npm test
   npm run typecheck
   npm run lint
   ```

   Gate 1 passes only when `npm test` exits 0 (with `numFailedTests`, `numPendingTests` and `numTodoTests` all 0) and `tsc` and lint are clean. Then delete the worktree.
4. **Schema session (review + merge).** Review the migration line by line against §5: every column, type, nullability, default, constraint, index, and RLS setting (enabled, no policies). Resolve any discrepancy by changing **either** the migration **or** §5 (per §7), never by leaving them different. If anything on `schema` changed after Gate 1, re-run Gate 1. Only then merge `schema` into `main`.

### Forbidden

- Merging `schema` (or applying its migration to the production project) before Gate 1 has passed on the current tips of both branches.
- Writing to `src/db/` (or anything else outside its ownership column) from the schema session, and writing to `supabase/migrations/` or `src/types/` from the server session.
- Changing endpoint contracts (§4) from the schema session. A required change goes back to the server session.

---

## 7. Change control

- Any change to an endpoint shape, an `ErrorCode`, or a §5 field is made in this file first, in the same PR as the code.
- The PR description names the changed section.
- Adding an `ErrorCode` requires updating the §3.3 table and adding the test required by §2, criterion 2.
