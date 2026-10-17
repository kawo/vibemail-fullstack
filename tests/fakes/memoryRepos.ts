import { type ListCursor, type ListFilter, type MessageRow, type MessageWrite, type MessagesRepository, toMessageRow } from '../../src/db/messages';
import { deriveStatus } from '../../src/db/status';
import type {
  ConnectedAccount,
  ConnectedUserInput,
  RenewalCandidate,
  UpsertResult,
  UsersRepository,
} from '../../src/db/users';
import type { AccountCredentials, ProviderMessage, TokenUpdate } from '../../src/providers/provider';
import type { UserRow } from '../../src/types';

export interface MemoryUserRow extends Omit<ConnectedUserInput, 'name'> {
  name?: string | null;
  watch?: Date;
  historyId: string | null;
  lastSyncedAt: Date | null;
}

/** In-memory `UsersRepository`, keyed by user ID. */
export class MemoryUsers implements UsersRepository {
  rows = new Map<string, MemoryUserRow>();
  tokenWrites: Array<[string, TokenUpdate]> = [];
  upsertResult: UpsertResult = 'ok';
  cleared: string[] = [];
  throwOnRead: Error | null = null;

  async upsertConnectedUser(input: ConnectedUserInput): Promise<UpsertResult> {
    if (this.upsertResult === 'ok') {
      this.rows.set(input.userId, { ...input, historyId: null, lastSyncedAt: null });
    }
    return this.upsertResult;
  }
  async updateUserTokens(userId: string, update: TokenUpdate): Promise<void> {
    this.tokenWrites.push([userId, update]);
  }
  async getUserCredentials(userId: string): Promise<AccountCredentials | null> {
    if (this.throwOnRead) {
      throw this.throwOnRead;
    }
    return this.rows.get(userId)?.credentials ?? null;
  }
  async updateWatchExpiry(userId: string, expiresAt: Date): Promise<void> {
    const row = this.rows.get(userId);
    if (row) {
      row.watch = expiresAt;
    }
  }
  async getUser(userId: string): Promise<UserRow | null> {
    const row = this.rows.get(userId);
    if (!row) {
      return null;
    }
    const at = new Date(0).toISOString();
    return {
      google_id: row.googleId,
      user_id: row.userId,
      email: row.email,
      name: row.name ?? null,
      scopes: row.scopes,
      refresh_token: this.cleared.includes(userId) ? null : 'encrypted',
      access_token: null,
      access_token_expires_at: null,
      history_id: row.historyId,
      last_synced_at: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      watch_expiration: row.watch ? row.watch.toISOString() : null,
      created_at: at,
      updated_at: at,
    };
  }
  async getUserEmail(userId: string): Promise<string | null> {
    return this.rows.get(userId)?.email ?? null;
  }
  async getLastSyncedAt(userId: string): Promise<Date | null> {
    return this.rows.get(userId)?.lastSyncedAt ?? null;
  }
  async getHistoryId(userId: string): Promise<string | null> {
    return this.rows.get(userId)?.historyId ?? null;
  }
  async updateHistoryId(userId: string, historyId: string, syncedAt: Date): Promise<void> {
    const row = this.rows.get(userId);
    if (row) {
      row.historyId = historyId;
      row.lastSyncedAt = syncedAt;
    }
  }
  async findAccountByEmailUnscoped(email: string): Promise<ConnectedAccount | null> {
    const row = [...this.rows.values()].find((r) => r.email === email);
    if (!row || this.cleared.includes(row.userId)) {
      return null;
    }
    return { userId: row.userId, historyId: row.historyId, credentials: row.credentials };
  }
  /** Users whose stored tokens should read as undecryptable. */
  undecryptable = new Set<string>();
  async listConnectedAccountsUnscoped({ watchExpiringBefore }: { watchExpiringBefore: Date }): Promise<RenewalCandidate[]> {
    return [...this.rows.values()]
      .filter((r) => !this.cleared.includes(r.userId))
      .filter((r) => r.watch === undefined || r.watch.getTime() < watchExpiringBefore.getTime())
      .map((r) => ({ userId: r.userId, credentials: this.undecryptable.has(r.userId) ? null : r.credentials }));
  }
  async clearUserTokens(userId: string): Promise<void> {
    this.cleared.push(userId);
  }
}

/** In-memory `MessagesRepository`, keyed by `(user_id, gmail_id)` like the real conflict target. */
export class MemoryMessages implements MessagesRepository {
  rows = new Map<string, MessageRow>();
  upsertCalls = 0;
  deleted: Array<[string, string]> = [];

  static key(userId: string, gmailId: string): string {
    return `${userId}:${gmailId}`;
  }

  /** Newest first, strictly after `after`, matching the real keyset order. */
  private page(rows: MessageRow[], limit: number, after: ListCursor | null): MessageRow[] {
    const before = (r: MessageRow) =>
      !after ||
      r.internal_date < after.internalDate ||
      (r.internal_date === after.internalDate && r.gmail_id < after.gmailId);
    return rows
      .filter(before)
      .sort((a, b) =>
        a.internal_date === b.internal_date
          ? b.gmail_id.localeCompare(a.gmail_id)
          : b.internal_date.localeCompare(a.internal_date),
      )
      .slice(0, limit);
  }
  /** Same predicates as the Supabase repository's `label` filter (CONTRACT.md §4.2). */
  async listMessages(userId: string, limit: number, after: ListCursor | null, filter: ListFilter): Promise<MessageRow[]> {
    const live = (r: MessageRow) => r.status !== 'trash' && r.status !== 'spam';
    const matches = (r: MessageRow): boolean => {
      switch (filter.kind) {
        case 'archive':
          return r.status === 'archived';
        case 'trash':
          return r.status === 'trash';
        case 'starred':
          return live(r) && r.is_starred;
        case 'label':
          return live(r) && r.label_ids.includes(filter.labelId);
        default:
          return live(r);
      }
    };
    return this.page(this.forUser(userId).filter(matches), limit, after);
  }
  async listThread(userId: string, threadId: string, limit: number): Promise<MessageRow[]> {
    return this.page(this.forUser(userId).filter((r) => r.thread_id === threadId), limit, null);
  }
  /** Same semantics as the `search_messages` SQL function: every term, case-insensitive substring. */
  async searchMessages(userId: string, terms: string[], limit: number, after: ListCursor | null): Promise<MessageRow[]> {
    const matches = (r: MessageRow) =>
      terms.every((term) => {
        const t = term.toLowerCase();
        return [r.subject ?? '', r.from_address, r.snippet, r.body_plain ?? '', ...r.to_address].some((field) =>
          field.toLowerCase().includes(t),
        );
      });
    return this.page(this.forUser(userId).filter(matches), limit, after);
  }
  async getMessage(userId: string, gmailId: string): Promise<MessageRow | null> {
    return this.rows.get(MemoryMessages.key(userId, gmailId)) ?? null;
  }
  async upsertMessage(userId: string, message: ProviderMessage, syncedAt: Date): Promise<MessageWrite> {
    const row = toMessageRow(userId, message, syncedAt);
    await this.upsertMessages(userId, [row]);
    return row;
  }
  async upsertMessages(userId: string, rows: MessageWrite[]): Promise<void> {
    this.upsertCalls += 1;
    for (const row of rows) {
      if (row.user_id !== userId) {
        throw new Error('row user_id does not match the scoped user');
      }
      const key = MemoryMessages.key(row.user_id, row.gmail_id);
      const at = new Date(0).toISOString();
      this.rows.set(key, { ...row, id: this.rows.get(key)?.id ?? key, created_at: at, updated_at: at });
    }
  }
  async deleteMessage(userId: string, gmailId: string): Promise<void> {
    this.deleted.push([userId, gmailId]);
    this.rows.delete(MemoryMessages.key(userId, gmailId));
  }
  async getLabels(userId: string, gmailId: string): Promise<string[] | null> {
    return this.rows.get(MemoryMessages.key(userId, gmailId))?.label_ids ?? null;
  }
  async updateLabels(
    userId: string,
    gmailId: string,
    update: { labels: string[]; isRead: boolean; isStarred: boolean; syncedAt: Date },
  ): Promise<void> {
    const row = this.rows.get(MemoryMessages.key(userId, gmailId));
    if (row) {
      this.rows.set(MemoryMessages.key(userId, gmailId), {
        ...row,
        label_ids: update.labels,
        status: deriveStatus(update.labels),
        is_read: update.isRead,
        is_starred: update.isStarred,
        synced_at: update.syncedAt.toISOString(),
      });
    }
  }
  forUser(userId: string): MessageRow[] {
    return [...this.rows.values()].filter((row) => row.user_id === userId);
  }
}
