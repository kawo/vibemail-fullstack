import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types';
import { DatabaseError } from './users';

/** One uploaded file's row (CONTRACT.md §5.5). The bytes live in Storage at `storagePath`. */
export interface AttachmentRow {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  /** The declared size; send reads the stored object's real size instead (§4.3). */
  size: number;
  storagePath: string;
  createdAt: string;
}

export interface NewAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

/** Every query filters on `user_id` (§5.3). */
export interface AttachmentsRepository {
  create(userId: string, attachment: NewAttachment): Promise<AttachmentRow>;
  delete(userId: string, id: string): Promise<void>;
  /** The caller's rows among `ids`; unknown IDs and other users' rows are simply absent. */
  getMany(userId: string, ids: readonly string[]): Promise<AttachmentRow[]>;
}

type Row = Database['public']['Tables']['attachments']['Row'];

const COLUMNS = 'id, user_id, filename, mime_type, size_bytes, storage_path, created_at';

function fromRow(row: Row): AttachmentRow {
  return {
    id: row.id,
    userId: row.user_id,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

export function createAttachmentsRepository(db: SupabaseClient<Database>): AttachmentsRepository {
  const table = () => db.from('attachments');
  return {
    async create(userId, attachment) {
      const { data, error } = await table()
        .insert({
          id: attachment.id,
          user_id: userId,
          filename: attachment.filename,
          mime_type: attachment.mimeType,
          size_bytes: attachment.size,
          storage_path: attachment.storagePath,
        })
        .select(COLUMNS)
        .single();
      if (error || !data) {
        throw new DatabaseError('attachments insert', error);
      }
      return fromRow(data);
    },

    async delete(userId, id) {
      const { error } = await table().delete().eq('user_id', userId).eq('id', id);
      if (error) {
        throw new DatabaseError('attachments delete', error);
      }
    },

    async getMany(userId, ids) {
      if (ids.length === 0) {
        return [];
      }
      const { data, error } = await table().select(COLUMNS).eq('user_id', userId).in('id', [...ids]);
      if (error) {
        throw new DatabaseError('attachments lookup', error);
      }
      return (data ?? []).map(fromRow);
    },
  };
}
