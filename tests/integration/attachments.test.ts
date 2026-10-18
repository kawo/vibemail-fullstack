/**
 * The attachments repository and the Storage adapter against the LIVE dev/test project
 * (CONTRACT.md §5.5): needs the schema session's `attachments` table and bucket.
 */
import { randomUUID } from 'node:crypto';
import { createDb } from '../../src/db';
import { createAttachmentStore } from '../../src/storage/attachments';
import { ENCRYPTION_KEY, admin, createTestUser, deleteTestUsers } from './support';

jest.setTimeout(60_000);

const db = () => createDb(admin(), ENCRYPTION_KEY);
const store = () => createAttachmentStore(admin());
const paths: string[] = [];

afterAll(async () => {
  if (paths.length > 0) {
    await admin().storage.from('attachments').remove(paths);
  }
  await deleteTestUsers();
});

const draft = (userId: string) => {
  const id = randomUUID();
  return { id, filename: 'notes.txt', mimeType: 'text/plain', size: 10, storagePath: `${userId}/${id}` };
};

describe('attachments repository', () => {
  it('creates a row and reads it back for its owner only', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const row = draft(owner.userId);
    const created = await db().attachments.create(owner.userId, row);
    expect(created).toMatchObject({ ...row, userId: owner.userId });
    await expect(db().attachments.getMany(owner.userId, [row.id])).resolves.toEqual([created]);
    await expect(db().attachments.getMany(other.userId, [row.id])).resolves.toEqual([]);
  });

  it('deletes a row', async () => {
    const owner = await createTestUser();
    const row = draft(owner.userId);
    await db().attachments.create(owner.userId, row);
    await db().attachments.delete(owner.userId, row.id);
    await expect(db().attachments.getMany(owner.userId, [row.id])).resolves.toEqual([]);
  });
});

describe('attachment store', () => {
  it('accepts a PUT to the signed URL with the returned headers, then reads the bytes back', async () => {
    const owner = await createTestUser();
    const path = `${owner.userId}/${randomUUID()}`;
    paths.push(path);
    const upload = await store().createUploadUrl(path, 'text/plain');
    expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: Buffer.from('0123456789') });
    expect(put.ok).toBe(true);
    const object = await store().read(path);
    expect(object?.content.toString('utf8')).toBe('0123456789');
    expect(object?.contentType).toMatch(/^text\/plain/);
  });

  it('reads a missing object as null', async () => {
    const owner = await createTestUser();
    await expect(store().read(`${owner.userId}/${randomUUID()}`)).resolves.toBeNull();
  });
});
