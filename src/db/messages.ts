import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderMessage } from '../providers/provider';
import type { AttachmentMeta, Database, MessageRow } from '../types';
import { deriveStatus } from './status';
import { DatabaseError } from './users';

/**
 * Repository for the `messages` table (CONTRACT.md §5.1). Upserts conflict on
 * `(user_id, gmail_id)`, so two users holding the same Gmail message ID never collide (§5.3).
 * Row shapes come from the generated `src/types/` (`MessageRow` narrows `attachments`).
 */

export type { MessageRow };

/** A row as written: every column except the ones the database generates. */
export type MessageWrite = Omit<MessageRow, 'id' | 'created_at' | 'updated_at'>;

/** Keyset position for list pagination: `(internal_date DESC, gmail_id DESC)`. */
export interface ListCursor {
  internalDate: string;
  gmailId: string;
}

/**
 * Server-side list filter, CONTRACT.md §4.2 `label` (v1.2). Every kind but `archive` and `trash`
 * leaves out `trash` and `spam`.
 */
export type ListFilter =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'label'; labelId: string };

/**
 * Maps a normalized message to the §5.1 columns: `from` → `from_address`, `to` → `to_address`,
 * `bodyText` → `body_plain`, flags from labels.
 */
export function toMessageRow(userId: string, message: ProviderMessage, syncedAt: Date): MessageWrite {
  const attachments: AttachmentMeta[] = message.attachments.map((a) => ({
    partId: a.partId,
    filename: a.filename,
    mimeType: a.mimeType,
    size: a.size,
    attachmentId: a.attachmentId,
  }));
  return {
    user_id: userId,
    gmail_id: message.id,
    thread_id: message.threadId,
    label_ids: message.labels,
    status: deriveStatus(message.labels),
    is_read: message.isRead,
    is_starred: message.isStarred,
    snippet: message.snippet,
    history_id: message.syncCursor,
    internal_date: message.receivedAt.toISOString(),
    size_estimate: message.sizeBytes,
    subject: message.subject,
    from_address: message.from,
    to_address: message.to,
    cc_addresses: message.cc,
    bcc_addresses: message.bcc,
    rfc822_message_id: message.rfc822MessageId,
    in_reply_to: message.inReplyTo,
    references: message.references,
    date_header: message.dateHeader,
    body_plain: message.bodyText,
    body_html: message.bodyHtml,
    attachments,
    synced_at: syncedAt.toISOString(),
  };
}

export interface MessagesRepository {
  /** Stored rows matching `filter`, newest first, strictly after `after`. Returns at most `limit` rows (CONTRACT.md §4.2). */
  listMessages(userId: string, limit: number, after: ListCursor | null, filter: ListFilter): Promise<MessageRow[]>;
  /** The newest `limit` rows of one thread, newest first (CONTRACT.md §4.8). */
  listThread(userId: string, threadId: string, limit: number): Promise<MessageRow[]>;
  /**
   * Rows where every term appears, case-insensitively, in subject, from, any to address, snippet
   * or plain body; newest first, strictly after `after` (CONTRACT.md §4.9).
   */
  searchMessages(userId: string, terms: string[], limit: number, after: ListCursor | null): Promise<MessageRow[]>;
  /** One stored message, or null. */
  getMessage(userId: string, gmailId: string): Promise<MessageRow | null>;
  /** Maps one normalized message (§5.1) and upserts it on `(user_id, gmail_id)`. Returns the written row. */
  upsertMessage(userId: string, message: ProviderMessage, syncedAt: Date): Promise<MessageWrite>;
  /** Upserts already-mapped rows on `(user_id, gmail_id)`. Every row must belong to `userId`. */
  upsertMessages(userId: string, rows: MessageWrite[]): Promise<void>;
  deleteMessage(userId: string, gmailId: string): Promise<void>;
  /** Stored labels of one message, or null when it is not stored. */
  getLabels(userId: string, gmailId: string): Promise<string[] | null>;
  /** Replaces a stored message's labels and the flags and `status` derived from them. */
  updateLabels(
    userId: string,
    gmailId: string,
    update: { labels: string[]; isRead: boolean; isStarred: boolean; syncedAt: Date },
  ): Promise<void>;
}

export function createMessagesRepository(db: SupabaseClient<Database>): MessagesRepository {
  const table = () => db.from('messages');

  async function upsertRows(userId: string, rows: MessageWrite[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    if (rows.some((row) => row.user_id !== userId)) {
      throw new DatabaseError('messages upsert', new Error('row user_id does not match the scoped user'));
    }
    const { error } = await table().upsert(rows, { onConflict: 'user_id,gmail_id' });
    if (error) {
      throw new DatabaseError('messages upsert', error);
    }
  }

  return {
    async listMessages(userId, limit, after, filter) {
      let query = table().select('*').eq('user_id', userId);
      switch (filter.kind) {
        case 'archive':
          query = query.eq('status', 'archived');
          break;
        case 'trash':
          query = query.eq('status', 'trash');
          break;
        case 'starred':
          query = query.not('status', 'in', '(trash,spam)').eq('is_starred', true);
          break;
        case 'label':
          // labelId is validated as Label_[A-Za-z0-9_-]+ (CONTRACT.md §4.2): no filter syntax in it.
          query = query.not('status', 'in', '(trash,spam)').contains('label_ids', [filter.labelId]);
          break;
        default:
          query = query.not('status', 'in', '(trash,spam)');
      }
      if (after) {
        // Values are an ISO timestamp and a Gmail ID: neither contains PostgREST filter syntax.
        query = query.or(
          `internal_date.lt.${after.internalDate},and(internal_date.eq.${after.internalDate},gmail_id.lt.${after.gmailId})`,
        );
      }
      const { data, error } = await query
        .order('internal_date', { ascending: false })
        .order('gmail_id', { ascending: false })
        .limit(limit)
        .overrideTypes<MessageRow[], { merge: false }>();
      if (error) {
        throw new DatabaseError('messages list', error);
      }
      return data ?? [];
    },

    async listThread(userId, threadId, limit) {
      const { data, error } = await table()
        .select('*')
        .eq('user_id', userId)
        .eq('thread_id', threadId)
        .order('internal_date', { ascending: false })
        .order('gmail_id', { ascending: false })
        .limit(limit)
        .overrideTypes<MessageRow[], { merge: false }>();
      if (error) {
        throw new DatabaseError('messages thread', error);
      }
      return data ?? [];
    },

    async searchMessages(userId, terms, limit, after) {
      // search_messages() filters on p_user_id itself (migration, CONTRACT.md §5.3).
      const { data, error } = await db
        .rpc('search_messages', {
          p_user_id: userId,
          p_terms: terms,
          p_limit: limit,
          ...(after ? { p_before_date: after.internalDate, p_before_gmail_id: after.gmailId } : {}),
        })
        .overrideTypes<MessageRow[], { merge: false }>();
      if (error) {
        throw new DatabaseError('messages search', error);
      }
      return data ?? [];
    },

    async getMessage(userId, gmailId) {
      const { data, error } = await table()
        .select('*')
        .eq('user_id', userId)
        .eq('gmail_id', gmailId)
        .maybeSingle()
        .overrideTypes<MessageRow | null, { merge: false }>();
      if (error) {
        throw new DatabaseError('messages lookup', error);
      }
      return data;
    },

    async upsertMessage(userId, message, syncedAt) {
      const row = toMessageRow(userId, message, syncedAt);
      await upsertRows(userId, [row]);
      return row;
    },

    upsertMessages: upsertRows,

    async getLabels(userId, gmailId) {
      const { data, error } = await table()
        .select('label_ids')
        .eq('user_id', userId)
        .eq('gmail_id', gmailId)
        .maybeSingle();
      if (error) {
        throw new DatabaseError('messages label lookup', error);
      }
      return data?.label_ids ?? null;
    },

    async updateLabels(userId, gmailId, update) {
      const { error } = await table()
        .update({
          label_ids: update.labels,
          status: deriveStatus(update.labels),
          is_read: update.isRead,
          is_starred: update.isStarred,
          synced_at: update.syncedAt.toISOString(),
        })
        .eq('user_id', userId)
        .eq('gmail_id', gmailId);
      if (error) {
        throw new DatabaseError('messages label update', error);
      }
    },

    async deleteMessage(userId, gmailId) {
      const { error } = await table().delete().eq('user_id', userId).eq('gmail_id', gmailId);
      if (error) {
        throw new DatabaseError('messages delete', error);
      }
    },
  };
}
