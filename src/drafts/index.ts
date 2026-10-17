import type { UsersRepository } from '../db/users';
import { ApiError } from '../middleware/errors';
import { type DraftResult, type MailProviderFactory, type OutgoingMessage, ProviderError } from '../providers/provider';
import { CR_LF, MAX_RECIPIENTS, MAX_SUBJECT, THREAD_ID, isValidAddress } from '../send';
import { apiErrorFromProvider, providerForUser } from '../services/gmailAccount';
import type { DraftDTO } from '../types';

/**
 * Drafts, CONTRACT.md §4.10–§4.12 (v1.1). Drafts live in Gmail only and are never stored in the
 * DB. `draftId` is server-managed: Gmail assigns it, and a request body may never carry one.
 */

export type { DraftDTO };

export interface DraftDeps {
  factory: MailProviderFactory;
  users: UsersRepository;
  now?: () => Date;
}

export interface ValidatedDraft {
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
}

const DRAFT_ID = /^[A-Za-z0-9_-]+$/;
/** Keys a client may never send: both are server-managed (§3.4, §3.7). */
const SERVER_MANAGED = ['draftId', 'status'];

type Issue = { field: string; message: string };

/** Validates a §3.7 `DraftRequest`. Every field is optional: a draft may be incomplete. */
export function validateDraftInput(input: unknown): ValidatedDraft {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ApiError('VALIDATION_FAILED', 'invalid draft', {
      details: { issues: [{ field: 'body', message: 'must be a JSON object' }] },
    });
  }
  const record = input as Record<string, unknown>;
  const issues: Issue[] = [];

  for (const key of SERVER_MANAGED) {
    if (key in record) {
      issues.push({ field: key, message: 'is server-managed and cannot be sent' });
    }
  }

  const rawTo = record.to ?? [];
  const to = typeof rawTo === 'string' ? [rawTo] : Array.isArray(rawTo) ? rawTo : null;
  if (!to) {
    issues.push({ field: 'to', message: 'must be an address or a list of addresses' });
  } else if (to.length > MAX_RECIPIENTS) {
    issues.push({ field: 'to', message: `at most ${MAX_RECIPIENTS} recipients` });
  } else {
    to.forEach((address, i) => {
      if (typeof address !== 'string' || !isValidAddress(address)) {
        issues.push({ field: `to[${i}]`, message: 'not a valid email address' });
      }
    });
  }

  const subject = record.subject ?? '';
  if (typeof subject !== 'string') {
    issues.push({ field: 'subject', message: 'must be a string' });
  } else if (CR_LF.test(subject)) {
    issues.push({ field: 'subject', message: 'must not contain line breaks' });
  } else if (subject.length > MAX_SUBJECT) {
    issues.push({ field: 'subject', message: `at most ${MAX_SUBJECT} characters` });
  }

  const body = record.body ?? '';
  if (typeof body !== 'string') {
    issues.push({ field: 'body', message: 'must be a string' });
  }

  const threadId = record.threadId;
  if (threadId !== undefined && (typeof threadId !== 'string' || !THREAD_ID.test(threadId))) {
    issues.push({ field: 'threadId', message: 'must be a Gmail thread ID' });
  }

  if (issues.length > 0) {
    throw new ApiError('VALIDATION_FAILED', 'invalid draft', { details: { issues } });
  }
  return {
    to: (to as string[]).map((a) => a.trim()),
    subject: subject as string,
    body: body as string,
    ...(typeof threadId === 'string' ? { threadId } : {}),
  };
}

function checkDraftId(draftId: string): void {
  if (!DRAFT_ID.test(draftId)) {
    throw new ApiError('VALIDATION_FAILED', 'invalid draft id', {
      details: { issues: [{ field: 'draftId', message: 'must be a Gmail draft ID' }] },
    });
  }
}

function toDraftDTO(result: DraftResult, draft: ValidatedDraft, updatedAt: Date): DraftDTO {
  return {
    draftId: result.draftId,
    gmailId: result.messageId,
    threadId: result.threadId,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    updatedAt: updatedAt.toISOString(),
  };
}

/** Maps a provider failure; `notFound` names what a Gmail 404 means for this call. */
async function rethrow(
  deps: DraftDeps,
  userId: string,
  error: unknown,
  notFound: Record<string, string> | null,
): Promise<never> {
  if (error instanceof ProviderError) {
    if (error.kind === 'revoked') {
      await deps.users.clearUserTokens(userId);
    }
    if (error.kind === 'not_found' && notFound) {
      throw new ApiError('MESSAGE_NOT_FOUND', 'not found in this mailbox', { details: notFound });
    }
    throw apiErrorFromProvider(error);
  }
  throw error;
}

function outgoing(from: string, draft: ValidatedDraft): OutgoingMessage {
  return {
    from,
    to: draft.to,
    subject: draft.subject,
    text: draft.body,
    ...(draft.threadId ? { threadId: draft.threadId } : {}),
  };
}

async function sender(deps: DraftDeps, userId: string): Promise<string> {
  const from = await deps.users.getUserEmail(userId);
  if (!from) {
    throw new ApiError('GMAIL_NOT_CONNECTED', 'Gmail is not connected');
  }
  return from;
}

/** `POST /api/v1/drafts`. */
export async function createDraft(deps: DraftDeps, userId: string, input: unknown): Promise<DraftDTO> {
  const draft = validateDraftInput(input);
  const from = await sender(deps, userId);
  const provider = await providerForUser(deps, userId);
  const now = deps.now ?? (() => new Date());
  try {
    const result = await provider.createDraft(outgoing(from, draft));
    return toDraftDTO(result, draft, now());
  } catch (error) {
    return rethrow(deps, userId, error, draft.threadId ? { threadId: draft.threadId } : null);
  }
}

/** `PATCH /api/v1/drafts/{draftId}`: a full replacement; omitted fields reset to their defaults. */
export async function updateDraft(deps: DraftDeps, userId: string, draftId: string, input: unknown): Promise<DraftDTO> {
  checkDraftId(draftId);
  const draft = validateDraftInput(input);
  const from = await sender(deps, userId);
  const provider = await providerForUser(deps, userId);
  const now = deps.now ?? (() => new Date());
  try {
    const result = await provider.updateDraft(draftId, outgoing(from, draft));
    return toDraftDTO(result, draft, now());
  } catch (error) {
    return rethrow(deps, userId, error, { draftId });
  }
}

/** `DELETE /api/v1/drafts/{draftId}`. */
export async function deleteDraft(deps: DraftDeps, userId: string, draftId: string): Promise<void> {
  checkDraftId(draftId);
  const provider = await providerForUser(deps, userId);
  try {
    await provider.deleteDraft(draftId);
  } catch (error) {
    await rethrow(deps, userId, error, { draftId });
  }
}

export const DEFAULT_DRAFT_LIMIT = 25;
export const MAX_DRAFT_LIMIT = 50;

export interface ListDraftsResponse {
  drafts: DraftDTO[];
  nextCursor: string | null;
}

/** Opaque draft-list cursor (CONTRACT.md §4.13): `base64url(JSON.stringify({ p: nextPageToken }))`. */
export function encodeDraftCursor(pageToken: string): string {
  return Buffer.from(JSON.stringify({ p: pageToken }), 'utf8').toString('base64url');
}

function decodeDraftCursor(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    parsed = null;
  }
  const p = (parsed as { p?: unknown } | null)?.p;
  if (typeof p !== 'string' || p === '') {
    throw new ApiError('VALIDATION_FAILED', 'invalid cursor', { details: { issues: [{ field: 'cursor', message: 'malformed' }] } });
  }
  return p;
}

export function parseDraftListQuery(url: URL): { limit: number; cursor: string | null; pageToken: string | null } {
  const rawLimit = url.searchParams.get('limit');
  let limit = DEFAULT_DRAFT_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > MAX_DRAFT_LIMIT) {
      throw new ApiError('VALIDATION_FAILED', 'invalid limit', {
        details: { issues: [{ field: 'limit', message: `integer 1..${MAX_DRAFT_LIMIT}` }] },
      });
    }
    limit = Number(rawLimit);
  }
  const cursor = url.searchParams.get('cursor');
  return { limit, cursor, pageToken: cursor === null ? null : decodeDraftCursor(cursor) };
}

/**
 * `GET /api/v1/drafts` (CONTRACT.md §4.13): one page of the user's Gmail drafts, newest first.
 * Drafts aren't stored, so this reads Gmail on every call. A page token Gmail rejects is
 * `VALIDATION_FAILED` with `details.cursor`.
 */
export async function listDrafts(
  deps: DraftDeps,
  userId: string,
  query: { limit: number; cursor: string | null; pageToken: string | null },
): Promise<ListDraftsResponse> {
  const provider = await providerForUser(deps, userId);
  try {
    const page = await provider.listDrafts({ limit: query.limit, pageToken: query.pageToken });
    return {
      drafts: page.drafts.map((d) => ({
        draftId: d.draftId,
        gmailId: d.messageId,
        threadId: d.threadId,
        to: d.to,
        subject: d.subject,
        body: d.body,
        updatedAt: d.updatedAt.toISOString(),
      })),
      nextCursor: page.nextPageToken ? encodeDraftCursor(page.nextPageToken) : null,
    };
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'invalid_request' && query.cursor !== null) {
      throw new ApiError('VALIDATION_FAILED', 'invalid cursor', { details: { cursor: query.cursor } });
    }
    return rethrow(deps, userId, error, null);
  }
}
