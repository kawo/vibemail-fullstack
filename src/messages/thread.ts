import type { MessagesRepository } from '../db/messages';
import type { UsersRepository } from '../db/users';
import { ApiError } from '../middleware/errors';
import { type MessageDTO, toMessageDTO } from './dto';

/** Thread view, CONTRACT.md §4.8 (v1.1). Reads the DB only; never calls Gmail. */

export const THREAD_LIMIT = 100;
const THREAD_ID = /^[A-Za-z0-9]+$/;

export interface ThreadDeps {
  users: UsersRepository;
  messages: MessagesRepository;
}

export interface ThreadResponse {
  threadId: string;
  /** Oldest first; at most the 100 newest stored messages of the thread. */
  messages: MessageDTO[];
  truncated: boolean;
}

export async function getThread(deps: ThreadDeps, userId: string, threadId: string): Promise<ThreadResponse> {
  if (!THREAD_ID.test(threadId)) {
    throw new ApiError('VALIDATION_FAILED', 'invalid thread id', {
      details: { issues: [{ field: 'threadId', message: 'must be a Gmail thread ID' }] },
    });
  }
  const credentials = await deps.users.getUserCredentials(userId);
  if (!credentials) {
    throw new ApiError('GMAIL_NOT_CONNECTED', 'Gmail is not connected');
  }
  // Newest first with one extra row, to know whether older messages were left out.
  const rows = await deps.messages.listThread(userId, threadId, THREAD_LIMIT + 1);
  if (rows.length === 0) {
    throw new ApiError('MESSAGE_NOT_FOUND', 'thread not found', { details: { threadId } });
  }
  return {
    threadId,
    messages: rows.slice(0, THREAD_LIMIT).reverse().map(toMessageDTO),
    truncated: rows.length > THREAD_LIMIT,
  };
}
