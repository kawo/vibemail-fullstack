import type { MessageRow, MessagesRepository } from '../db/messages';
import { deriveStatus } from '../db/status';
import type { UsersRepository } from '../db/users';
import { ApiError } from '../middleware/errors';
import { type MailProviderFactory, ProviderError } from '../providers/provider';
import { apiErrorFromProvider, providerForUser } from '../services/gmailAccount';

/**
 * Label updates, CONTRACT.md §4.7 (v1.1): star, unstar, mark unread, archive, trash, restore and
 * custom labels on one message. `status` is never accepted; it follows from the labels (§3.4).
 */

export interface LabelUpdateDeps {
  factory: MailProviderFactory;
  users: UsersRepository;
  messages: MessagesRepository;
  now?: () => Date;
}

export interface LabelChange {
  add: string[];
  remove: string[];
}

const GMAIL_ID = /^[A-Za-z0-9]+$/;
const MAX_LABELS = 20;
const ALLOWED_KEYS = new Set(['addLabelIds', 'removeLabelIds']);

type Issue = { field: string; message: string };

function labelList(value: unknown, field: string, issues: Issue[]): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push({ field, message: 'must be an array of label IDs' });
    return [];
  }
  if (value.length > MAX_LABELS) {
    issues.push({ field, message: `at most ${MAX_LABELS} labels` });
  }
  const labels: string[] = [];
  value.forEach((label, i) => {
    if (typeof label !== 'string' || label.length === 0) {
      issues.push({ field: `${field}[${i}]`, message: 'must be a non-empty string' });
    } else {
      labels.push(label);
    }
  });
  return labels;
}

/** Validates an untrusted body against the §4.7 rules, collecting every issue. */
export function validateLabelUpdate(input: unknown, factory: Pick<MailProviderFactory, 'wellKnownLabels'>): LabelChange {
  const issues: Issue[] = [];
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ApiError('VALIDATION_FAILED', 'invalid label update', {
      details: { issues: [{ field: 'body', message: 'must be a JSON object' }] },
    });
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      // Includes `status`, `isRead` and `isStarred`: they follow from labels and are never set directly.
      issues.push({ field: key, message: 'is not allowed; send addLabelIds or removeLabelIds' });
    }
  }

  const add = labelList(record.addLabelIds, 'addLabelIds', issues);
  const remove = labelList(record.removeLabelIds, 'removeLabelIds', issues);
  const all = [...add, ...remove];
  if (all.length === 0) {
    issues.push({ field: 'body', message: 'at least one label is required' });
  }
  for (const label of add.filter((l) => remove.includes(l))) {
    issues.push({ field: 'removeLabelIds', message: `${label} is also in addLabelIds` });
  }

  const { draft, sent, spam, trash } = factory.wellKnownLabels;
  const forbidden = new Set([draft, sent, spam, 'CHAT']);
  for (const label of all.filter((l) => forbidden.has(l))) {
    issues.push({ field: add.includes(label) ? 'addLabelIds' : 'removeLabelIds', message: `${label} cannot be changed` });
  }
  if (all.includes(trash) && all.length > 1) {
    issues.push({ field: 'body', message: `${trash} must be the only label in the request` });
  }

  if (issues.length > 0) {
    throw new ApiError('VALIDATION_FAILED', 'invalid label update', { details: { issues } });
  }
  return { add, remove };
}

export async function updateMessageLabels(
  deps: LabelUpdateDeps,
  userId: string,
  gmailId: string,
  input: unknown,
): Promise<MessageRow> {
  if (!GMAIL_ID.test(gmailId)) {
    throw new ApiError('VALIDATION_FAILED', 'invalid message id', {
      details: { issues: [{ field: 'id', message: 'must be a Gmail message ID' }] },
    });
  }
  const change = validateLabelUpdate(input, deps.factory);
  const now = deps.now ?? (() => new Date());

  // Not stored for this user (including another user's message): no Gmail call.
  const stored = await deps.messages.getMessage(userId, gmailId);
  if (!stored) {
    throw new ApiError('MESSAGE_NOT_FOUND', 'message not found');
  }

  const provider = await providerForUser(deps, userId);
  const { trash, unread, starred } = deps.factory.wellKnownLabels;
  let labels: string[];
  try {
    if (change.add.includes(trash)) {
      ({ labels } = await provider.trash(gmailId));
    } else if (change.remove.includes(trash)) {
      ({ labels } = await provider.untrash(gmailId));
    } else {
      ({ labels } = await provider.modifyLabels(gmailId, change));
    }
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.kind === 'not_found') {
        await deps.messages.deleteMessage(userId, gmailId);
        throw new ApiError('MESSAGE_NOT_FOUND', 'message no longer exists in Gmail');
      }
      if (error.kind === 'invalid_request') {
        throw new ApiError('VALIDATION_FAILED', 'Gmail rejected a label ID', {
          details: { labelIds: [...change.add, ...change.remove] },
        });
      }
      if (error.kind === 'revoked') {
        await deps.users.clearUserTokens(userId);
      }
      throw apiErrorFromProvider(error);
    }
    throw error;
  }

  const syncedAt = now();
  const update = { labels, isRead: !labels.includes(unread), isStarred: labels.includes(starred), syncedAt };
  await deps.messages.updateLabels(userId, gmailId, update);
  return {
    ...stored,
    label_ids: labels,
    status: deriveStatus(labels),
    is_read: update.isRead,
    is_starred: update.isStarred,
    synced_at: syncedAt.toISOString(),
  };
}
