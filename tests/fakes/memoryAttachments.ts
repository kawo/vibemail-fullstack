import type { AttachmentRow, AttachmentsRepository, NewAttachment } from '../../src/db/attachments';
import type { AttachmentStore, SignedUpload, StoredObject } from '../../src/storage/attachments';

/** In-memory `attachments` table (CONTRACT.md §5.5), scoped by user like the real one. */
export class MemoryAttachments implements AttachmentsRepository {
  rows = new Map<string, AttachmentRow>();

  async create(userId: string, attachment: NewAttachment): Promise<AttachmentRow> {
    const row: AttachmentRow = { ...attachment, userId, createdAt: new Date('2026-10-18T10:00:00.000Z').toISOString() };
    this.rows.set(attachment.id, row);
    return row;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (this.rows.get(id)?.userId === userId) {
      this.rows.delete(id);
    }
  }

  async getMany(userId: string, ids: readonly string[]): Promise<AttachmentRow[]> {
    return ids.map((id) => this.rows.get(id)).filter((r): r is AttachmentRow => r !== undefined && r.userId === userId);
  }
}

/** In-memory bucket. `objects` holds what the browser "uploaded". */
export class MemoryAttachmentStore implements AttachmentStore {
  objects = new Map<string, StoredObject>();
  signed: string[] = [];
  failCreate = false;

  async createUploadUrl(path: string, contentType: string): Promise<SignedUpload> {
    if (this.failCreate) {
      throw new Error('storage unavailable');
    }
    this.signed.push(path);
    return {
      url: `https://storage.test/object/upload/sign/attachments/${path}?token=t`,
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
      expiresAt: new Date('2026-10-18T12:00:00.000Z'),
    };
  }

  async read(path: string): Promise<StoredObject | null> {
    return this.objects.get(path) ?? null;
  }
}
