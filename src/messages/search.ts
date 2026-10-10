import type { ListCursor, MessagesRepository } from '../db/messages';
import type { UsersRepository } from '../db/users';
import { ApiError } from '../middleware/errors';
import { type MessageDTO, toMessageDTO } from './dto';
import { encodeCursor, parseListQuery } from './list';

/**
 * Search, CONTRACT.md §4.9 (v1.1). Reads the DB only; never calls Gmail. Every whitespace-separated
 * term must match; order, limit and cursor are those of the message list (§4.2).
 */

export const MIN_QUERY = 2;
export const MAX_QUERY = 200;

export interface SearchDeps {
  users: UsersRepository;
  messages: MessagesRepository;
}

export interface SearchQuery {
  terms: string[];
  limit: number;
  cursor: ListCursor | null;
}

export interface SearchResponse {
  messages: MessageDTO[];
  nextCursor: string | null;
}

export function parseSearchQuery(url: URL): SearchQuery {
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) {
    throw new ApiError('VALIDATION_FAILED', 'invalid search query', {
      details: { issues: [{ field: 'q', message: `${MIN_QUERY}..${MAX_QUERY} characters` }] },
    });
  }
  const { limit, cursor } = parseListQuery(url);
  return { terms: q.split(/\s+/), limit, cursor };
}

export async function searchMessages(deps: SearchDeps, userId: string, query: SearchQuery): Promise<SearchResponse> {
  const credentials = await deps.users.getUserCredentials(userId);
  if (!credentials) {
    throw new ApiError('GMAIL_NOT_CONNECTED', 'Gmail is not connected');
  }
  const rows = await deps.messages.searchMessages(userId, query.terms, query.limit + 1, query.cursor);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    messages: page.map(toMessageDTO),
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ internalDate: new Date(last.internal_date).toISOString(), gmailId: last.gmail_id })
        : null,
  };
}
