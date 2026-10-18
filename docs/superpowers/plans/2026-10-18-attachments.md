# Attachments (upload + send) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users attach files (up to 25 MB each, 25 MB per message) in the compose drawer and send them through Gmail.

**Architecture:** `POST /api/v1/attachments` reserves an upload (row in `attachments`, signed Supabase Storage URL); the browser PUTs the file straight to Storage, never through a function (Vercel's 4.5 MB body cap). `POST /api/v1/messages/send` takes `attachmentIds`, reads the objects from Storage with the service role, builds a `multipart/mixed` message and sends it with Gmail's media upload. The drawer shows one chip per file with its upload state.

**Tech Stack:** Next.js 15 / React 19 client, engine handlers in `src/`, Supabase Postgres + Storage (service role), `googleapis` Gmail v1, Jest (engine) and Vitest (client).

**Spec:** `CONTRACT.md` §3.3, §4.3, §4.14, §5.5 (as changed by Task 1) and `docs/design-system/DESIGN_SPEC.md` §3 "Attachments" (added by Task 1).

## Global Constraints

- Per-file limit **26,214,400 bytes** (25 × 1024 × 1024); per-message total of attachment bytes **26,214,400**.
- New ErrorCode **`FILE_TOO_LARGE`**: HTTP **413**, `retryable: false`. Reserve: `details: { maxBytes: 26214400, size }`. Send: `details: { maxBytes: 26214400, totalBytes }`.
- `attachmentIds` on send: optional array, at most **20**, each a UUID, no duplicates.
- Bucket `attachments`, private; object path `'{user_id}/{attachmentId}'`, built only from the token's `sub` and the server-generated UUID.
- Two-session rule: this work never writes `supabase/migrations/` or `src/types/`. Task 0 is the schema session's.
- TypeScript strict, never `any`. Engine target ES2020.
- The storage `PUT` from the browser never carries the user's VibeMail JWT.

## Review Focus

1. **The same file is picked twice, or 20+ files at once.** Each pick is its own chip and upload; the 21st and later chips show an error "At most 20 attachments" and are not uploaded (Task 8 test `caps the number of attachments at 20`).
2. **The drawer closes while uploads are in flight.** In-flight PUTs are aborted; no state update after unmount (Task 9 step: abort controllers in a ref, aborted in the unmount effect).
3. **A file is removed while its upload is still running.** The upload is aborted and its late result is ignored, so the chip doesn't come back (Task 8 test `ignores the result of a removed chip`).
4. **Send succeeds but the attachment rows/objects remain.** Expected: kept (no clean-up, CONTRACT §4.14 Known limits); a resend after `wasSent` never happens (existing rule).
5. **A file whose name has non-ASCII characters or quotes.** The MIME part uses RFC 2231 `filename*=UTF-8''…` so Gmail shows the right name (Task 5 test `encodes a non-ASCII filename with RFC 2231`).

---

### Task 0: Schema (handed to the schema session, not this session)

The user runs it as a separate schema session on branch `schema`. Prompt to give it:

> Implement CONTRACT.md §5.5 exactly on branch `schema`: a migration in `supabase/migrations/` creating the `attachments` table (columns, CHECKs, `UNIQUE (storage_path)`, `INDEX (user_id, created_at DESC)`, FK to `auth.users` on delete cascade, RLS enabled with no policies) and the private Storage bucket `attachments` with `file_size_limit = 26214400` and no `allowed_mime_types` (insert into `storage.buckets`). Regenerate `src/types/database.ts` (`npm run db:types` after applying to the dev/test project in `.env`; never production). Do not touch `src/db/` or anything outside your §6 ownership. Commit and push `schema`; don't merge.

Tasks 3, 4 and 6 compile against those types; until `schema` exists, `npm run typecheck` on `main` is expected to fail on `src/db/attachments.ts` only (§6). Unit tests use fakes and don't import that file.

---

### Task 1: Contract and spec

**Files:** Modify `CONTRACT.md` (§1, §3.3, §4.3, §4.14, header), `docs/design-system/DESIGN_SPEC.md` (§3).

- [ ] **Step 1:** §3.3: add `'FILE_TOO_LARGE'` to the union and the table row (413, false, "A file, or a message's attachments together, exceed 25 MB (§4.14, §4.3)").
- [ ] **Step 2:** §4.14: oversize `size` → `FILE_TOO_LARGE` (`details: { maxBytes, size }`) instead of `VALIDATION_FAILED`; error table updated; drop "No new ErrorCode"; mark section *implemented* only at the end (Task 10).
- [ ] **Step 3:** §4.3: request gains `attachmentIds?: string[]` with the Global Constraints rules. Behaviour: load the user's rows (unknown or another user's ID → `VALIDATION_FAILED`, issue `attachmentIds[i]` "unknown attachment"); read each object (missing → issue "not uploaded yet"); sum the **stored** sizes (> 26214400 → `FILE_TOO_LARGE`); attach each as a base64 part with the row's `filename` and the stored object's content type; with attachments the message is `multipart/mixed` and is sent by media upload (`uploadType=multipart`, `message/rfc822`). Rows and objects are kept after sending. Error table gains `FILE_TOO_LARGE`.
- [ ] **Step 4:** §1: move "Attachments on send" from out of scope to *Added in v1.3*; drafts with attachments stay out of scope. Header v1.3 line: send attachments too.
- [ ] **Step 5:** DESIGN_SPEC §3: endpoints list adds §4.14; new subsection **Attachments**: a pinned footer under the scroll area with an "Attach files" paperclip button (opens the native picker, `multiple`); one chip per file under the body: filename, size, remove (×, "Remove {filename}"); states *uploading* (spinner, `aria-busy`), *ready*, *error* (red, "Upload failed" + Retry; or "Larger than 25 MB" with no Retry, checked before any request); at most 20 (extra chips error "At most 20 attachments"); Send disabled while any chip is uploading or in error, or the ready total exceeds 25 MB (hint under the chips says which); attachments are not saved with drafts: closing the drawer drops them (hint "Attachments aren't saved with drafts" while any chip exists); `FILE_TOO_LARGE` on send → banner "These attachments are over 25 MB together". Error states list gains §4.14's codes.
- [ ] **Step 6:** Commit `Specify attachments on send and the compose attachment UI (v1.3)`.

### Task 2: `FILE_TOO_LARGE` in the engine and client error unions

**Files:** Modify `src/middleware/errors.ts`, `src/http/respond.ts` (`ERROR_STATUS`), `app/services/types.ts`. Test: `tests/unit/http.test.ts` (or the existing error-envelope test file).

**Produces:** `ErrorCode` includes `'FILE_TOO_LARGE'`; `ERROR_STATUS.FILE_TOO_LARGE = { status: 413, retryable: false }`.

- [ ] **Step 1:** Test `maps FILE_TOO_LARGE to 413, not retryable`: `errorResponse(new ApiError('FILE_TOO_LARGE','x',{details:{maxBytes:26214400}}))` → status 413, body `{ error: { code: 'FILE_TOO_LARGE', retryable: false, details: { maxBytes: 26214400 } } }`.
- [ ] **Step 2:** Run, see it fail (type error / undefined status). Add the code to both unions and the map. Run, pass. `npm run web:typecheck` clean.
- [ ] **Step 3:** Commit.

### Task 3: Attachment persistence and storage adapters

**Files:** Create `src/db/attachments.ts`, `src/storage/attachments.ts`, `tests/fakes/memoryAttachments.ts`. Modify `src/db/index.ts` (add `attachments` to `Db`), `src/http/deps.ts` (`AppDeps.attachments`, `AppDeps.attachmentStore`, built in `depsFromEnv`), every `AppDeps` fixture (`tests/unit/http.test.ts`, `listDrafts.test.ts`, `listFilter.test.ts`, `v11Endpoints.test.ts`, `tests/integration/support.ts`).

**Produces:**
- `interface AttachmentRow { id: string; userId: string; filename: string; mimeType: string; size: number; storagePath: string; createdAt: string }`
- `interface AttachmentsRepository { create(userId: string, row: { id: string; filename: string; mimeType: string; size: number; storagePath: string }): Promise<AttachmentRow>; delete(userId: string, id: string): Promise<void>; getMany(userId: string, ids: readonly string[]): Promise<AttachmentRow[]> }` (every query filters `user_id`, §5.3)
- `interface AttachmentStore { createUploadUrl(path: string): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }>; read(path: string): Promise<{ content: Buffer; contentType: string } | null> }` (`null` = object missing)
- `MemoryAttachments` / `MemoryAttachmentStore` fakes implementing both (store: `objects: Map<string, {content, contentType}>`, `failCreate?: boolean`).

- [ ] **Step 1:** Integration test `tests/integration/attachments.test.ts` (runs at Gate 1): create → getMany returns it; getMany for another user returns `[]`; delete removes it; `storage.createUploadUrl` then a raw `PUT` of 10 bytes, then `read` returns those bytes; `read` of a missing path → `null`.
- [ ] **Step 2:** Implement the repository on the typed service client and the store with `storage.from('attachments').createSignedUploadUrl(path)` / `.download(path)`. Headers returned for the PUT: `{ 'Content-Type': <mimeType passed by caller>, 'x-upsert': 'false' }` plus whatever Supabase's signed-upload endpoint needs; confirm at Gate 1 with a real PUT whether `apikey` is required. If it is, return an error to the user instead of adding an anon key to the engine (CLAUDE.md "no anon key"). `expiresAt` = now + 2 h.
- [ ] **Step 3:** Fakes + fixtures; `npx jest tests/unit` passes. Commit.

### Task 4: `POST /api/v1/attachments`

**Files:** Create `src/attachments/index.ts`, `src/endpoints/v1/attachments/index.ts`, `app/api/v1/attachments/route.ts`, `tests/unit/attachments.test.ts`. Modify `src/http/handlers.ts` (`Handlers.reserveAttachment`), `tests/unit/apiFiles.test.ts`, `tests/unit/nextRoutes.test.ts` (count 12 → 13).

**Consumes:** Task 3 interfaces. **Produces:** `reserveAttachment(deps: { attachments: AttachmentsRepository; attachmentStore: AttachmentStore; now: () => Date; newId?: () => string }, userId: string, body: unknown): Promise<AttachmentUploadResponse>`; `export const MAX_ATTACHMENT_BYTES = 26_214_400`.

- [ ] **Step 1: Tests** (handler level, fakes): `201 with attachment and upload`, storage path `'user-1/<id>'`; `trims the filename`; each invalid field → 400 `VALIDATION_FAILED` `details.field` (`filename` empty / 256 chars / contains `/`, `\`, `\u0007`; `mimeType` `'pdf'`, `'text/plain; charset=utf-8'`; `size` 0, 1.5, `'10'`); `size: 26214401` → 413 `FILE_TOO_LARGE` `{ maxBytes: 26214400, size: 26214401 }` and no row created; `26214400` accepted; signed-URL failure → 500 `INTERNAL` and the row deleted; no bearer → 401; no Gmail calls (`box.forbidCalls = true`).
- [ ] **Step 2:** Run, fail. Implement; endpoint file exports `POST` and `OPTIONS`; route file re-exports them with `runtime = 'nodejs'`. Run unit tests, pass. Commit.

### Task 5: MIME with attachments

**Files:** Modify `src/providers/provider.ts` (`OutgoingMessage.attachments?: OutgoingAttachment[]`, `interface OutgoingAttachment { filename: string; mimeType: string; content: Buffer }`), `src/providers/gmail/mime.ts`. Test: `tests/unit/mime.test.ts` (existing MIME tests' file).

- [ ] **Step 1: Tests:** `wraps the body and each attachment in multipart/mixed` (top `Content-Type: multipart/mixed; boundary=…`, first part is the existing text (or alternative) body, then one part per attachment with `Content-Type: <mimeType>; name="<filename>"`, `Content-Disposition: attachment; filename="<filename>"`, `Content-Transfer-Encoding: base64`, content wrapped at 76 chars and decoding back to the bytes); `encodes a non-ASCII filename with RFC 2231` (`filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`); `escapes quotes and strips CR/LF in filenames`; no attachments → output unchanged from today (snapshot of an existing case).
- [ ] **Step 2:** Run, fail. Implement in `buildRfc2822`. Run, pass. Commit.

### Task 6: Send with `attachmentIds`

**Files:** Modify `src/send/index.ts` (`validateSendInput` gains `attachmentIds`; `SendDeps` gains `attachments`, `attachmentStore`), `src/providers/gmail/provider.ts` (`sendMessage` uses `media: { mimeType: 'message/rfc822', body: rfc2822 }` when `attachments` is non-empty), `tests/fakes/fakeProvider.ts` (records attachments). Tests: `tests/unit/send.test.ts` (existing), `tests/unit/gmailProvider.test.ts`.

- [ ] **Step 1: Tests:** `sends stored attachments with their stored content type`; `rejects more than 20 / duplicate / non-UUID ids` (VALIDATION_FAILED issues `attachmentIds` / `attachmentIds[i]`); `another user's attachment is unknown`; `an attachment not uploaded yet` → issue "not uploaded yet", no provider call; `total over 25 MB` → 413 `FILE_TOO_LARGE` `{ maxBytes, totalBytes }` using stored sizes (declared size ignored), no provider call; `no attachmentIds → request unchanged` (existing tests stay green); provider test `uses media upload when there are attachments` and `keeps raw for plain messages`.
- [ ] **Step 2:** Run, fail. Implement. Run `npx jest tests/unit`, pass. Commit.

### Task 7: Client data layer

**Files:** Modify `app/services/types.ts` (`AttachmentUploadRequest`, `AttachmentUploadResponse`, `SendMessageRequest.attachmentIds?: string[]`), `app/services/source.ts` (`reserveAttachment(request: AttachmentUploadRequest, signal?: AbortSignal): Promise<AttachmentUploadResponse>`), `app/services/httpSource.ts`. Create `app/services/upload.ts`: `uploadToStorage(upload: AttachmentUploadResponse['upload'], file: Blob, signal?: AbortSignal): Promise<void>` (plain `fetch`, `upload.method`, `upload.headers`, body = file; non-2xx → throws `ApiError` with code `INTERNAL`, `canRetry: true`). Test: `app/services/__tests__/upload.test.ts`, extend `httpSource.test.ts`.

- [ ] **Step 1: Tests:** reserve posts JSON to `/api/v1/attachments` with the bearer; `uploadToStorage` PUTs the blob to `upload.url` with exactly `upload.headers` and **no `Authorization`**; a 413/400 from storage rejects; `send` passes `attachmentIds` through.
- [ ] **Step 2:** Run, fail. Implement. Run `npm run web:test`, pass. Commit.

### Task 8: Compose attachment state (pure)

**Files:** Create `app/lib/attachments.ts`, `app/lib/__tests__/attachments.test.ts`.

**Produces:**
- `type ChipState = 'uploading' | 'ready' | 'error'`; `interface AttachmentChip { key: string; name: string; size: number; type: string; state: ChipState; attachmentId?: string; error?: 'too-large' | 'too-many' | 'failed' }`
- `addFiles(chips: AttachmentChip[], files: { name: string; size: number; type: string }[], newKey: () => string): AttachmentChip[]` — over 25 MB → `error: 'too-large'`; beyond 20 chips → `error: 'too-many'`; else `uploading`.
- `settle(chips, key, result: { attachmentId: string } | 'failed'): AttachmentChip[]` (unknown key → unchanged).
- `sendBlock(chips): null | 'uploading' | 'error' | 'over-total'`; `attachmentIdsOf(chips): string[]`. Sizes are shown with the existing `formatSize` from `app/lib/format`.

- [ ] **Step 1: Tests:** `marks files over 25 MB too-large without uploading`, `caps the number of attachments at 20`, `ignores the result of a removed chip`, `blocks send while uploading, on error, and over 25 MB in total`, `collects ids of ready chips in order`; `type ''` → sent as `'application/octet-stream'`.
- [ ] **Step 2:** Run, fail. Implement. Run, pass. Commit.

### Task 9: Compose UI

**Files:** Create `app/components/compose/sheet/AttachmentChips.tsx`, `app/components/compose/sheet/ComposeFooter.tsx`. Modify `ComposeSheet.tsx`, `sheet/types.ts` (`ComposeView.attachments: AttachmentChip[]`, `ComposeView.attachHint: string | null`; actions `onAttachFiles(files: File[])`, `onRemoveAttachment(key)`, `onRetryAttachment(key)`), `ComposeDrawer.tsx`, `app/styles/app.css`, `app/components/icons.tsx` only if a glyph is missing (`paperclip` exists).

- [ ] **Step 1:** Drawer state: `chips` + `files: Map<key, File>` + `controllers: Map<key, AbortController>` in refs; `onAttachFiles` → `addFiles`, then for each `uploading` chip `api.reserveAttachment({ filename, mimeType, size })` → `uploadToStorage` → `settle`; `FILE_TOO_LARGE` from reserve → chip error `'too-large'`; other failure → `'failed'`. Remove aborts and drops. Retry re-runs for that key. Unmount aborts all. `canSend` also requires `sendBlock(chips) === null`; `send()` adds `attachmentIds: attachmentIdsOf(chips)` when non-empty; `FILE_TOO_LARGE` → banner per Task 1 Step 5.
- [ ] **Step 2:** Footer: pinned bar under `compose-scroll` with an icon button (`paperclip`, aria-label/title "Attach files", disabled while sending) that clicks a visually hidden `<input type="file" multiple>`; the input's value is reset after each pick so the same file can be picked again. Chips below the body field: `role="list"`, each chip `role="listitem"` with name (ellipsis, full name in `title`), size, spinner while uploading (`aria-busy`), red error style + message + Retry (not for `too-large`/`too-many`), remove button "Remove {name}". 44px hit areas on coarse pointers per existing pattern.
- [ ] **Step 3:** `npm run web:typecheck`, `npm run web:test`, `npm run web:build` clean. Commit.

### Task 10: Gate 1, end-to-end and docs

- [ ] **Step 1:** When `schema` is pushed: Gate 1 worktree per CONTRACT §6 (merge `schema` into `main`, `npm run typecheck`, `npx jest --ci --runInBand --json`; all of failed/pending/todo 0, including Task 3's integration test).
- [ ] **Step 2:** Browser check against the dev project with a seeded `@vibemail.test` user (as in earlier sessions): pick a small file → spinner → ready; pick a >25 MB file → too-large chip, no request; force a failed PUT (offline) → red chip, Retry works; Send disabled while uploading. Sending for real needs a connected Gmail account: the user does that one manually.
- [ ] **Step 3:** CONTRACT §4.14/§4.3: drop "not implemented yet"; CLAUDE.md: mention `src/storage/` and the attachments table in tenant isolation. Commit; remove the probe users.
