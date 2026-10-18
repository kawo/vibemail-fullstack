import { describe, expect, it } from 'vitest';
import {
  type AttachmentChip,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  addFiles,
  attachmentIdsOf,
  failAttachments,
  rejectedAttachmentIds,
  removeChip,
  retryChip,
  sendBlock,
  settle,
} from '@/app/lib/attachments';

let n = 0;
const newKey = () => `k${++n}`;
const file = (name: string, size = 10, type = 'text/plain') => ({ name, size, type });
const ready = (key: string, attachmentId: string, size = 10): AttachmentChip => ({ key, name: `${key}.txt`, size, type: 'text/plain', state: 'ready', attachmentId });

describe('compose attachments (DESIGN_SPEC.md §3 Attachments)', () => {
  it('adds each picked file as an uploading chip, in order', () => {
    const chips = addFiles([], [file('a.txt'), file('b.txt')], newKey);
    expect(chips.map((c) => [c.name, c.state])).toEqual([
      ['a.txt', 'uploading'],
      ['b.txt', 'uploading'],
    ]);
    expect(new Set(chips.map((c) => c.key)).size).toBe(2);
  });

  it('marks files over 25 MB too-large without uploading', () => {
    const [big, edge] = addFiles([], [file('big.iso', MAX_ATTACHMENT_BYTES + 1), file('edge.bin', MAX_ATTACHMENT_BYTES)], newKey);
    expect(big).toMatchObject({ state: 'error', error: 'too-large' });
    expect(edge).toMatchObject({ state: 'uploading' });
  });

  it('caps the number of attachments at 20', () => {
    const many = Array.from({ length: 22 }, (_, i) => file(`f${i}.txt`));
    const chips = addFiles([], many, newKey);
    expect(MAX_ATTACHMENTS).toBe(20);
    expect(chips.filter((c) => c.state === 'uploading')).toHaveLength(20);
    expect(chips.slice(20).every((c) => c.state === 'error' && c.error === 'too-many')).toBe(true);
  });

  it('counts chips already in the drawer toward the cap', () => {
    const existing = Array.from({ length: 19 }, (_, i) => ready(`r${i}`, `id${i}`));
    const added = addFiles(existing, [file('x.txt'), file('y.txt')], newKey).slice(19);
    expect(added.map((c) => c.error ?? c.state)).toEqual(['uploading', 'too-many']);
  });

  it('labels a file the browser gives no type as application/octet-stream', () => {
    expect(addFiles([], [file('blob', 3, '')], newKey)[0]?.type).toBe('application/octet-stream');
  });

  it('settles a chip as ready, failed or too large', () => {
    const chips = addFiles([], [file('a'), file('b'), file('c')], newKey);
    const [a, b, c] = chips.map((chip) => chip.key) as [string, string, string];
    let next = settle(chips, a, { attachmentId: 'att-a' });
    next = settle(next, b, 'failed');
    next = settle(next, c, 'too-large');
    expect(next.map((chip) => [chip.state, chip.attachmentId ?? chip.error])).toEqual([
      ['ready', 'att-a'],
      ['error', 'failed'],
      ['error', 'too-large'],
    ]);
  });

  it('ignores the result of a removed chip', () => {
    const chips = addFiles([], [file('a')], newKey);
    const key = chips[0]?.key ?? '';
    const removed = removeChip(chips, key);
    expect(settle(removed, key, { attachmentId: 'late' })).toEqual([]);
  });

  it('retries only failed uploads', () => {
    const chips = addFiles([], [file('a'), file('big', MAX_ATTACHMENT_BYTES + 1)], newKey);
    const [a, big] = chips.map((chip) => chip.key) as [string, string];
    const failed = settle(chips, a, 'failed');
    expect(retryChip(failed, a)[0]).toMatchObject({ state: 'uploading' });
    expect(retryChip(failed, a)[0]).not.toHaveProperty('error');
    expect(retryChip(failed, big)[1]).toMatchObject({ state: 'error', error: 'too-large' });
  });

  it('blocks send while uploading, on error, and over 25 MB in total', () => {
    expect(sendBlock([])).toBeNull();
    expect(sendBlock([ready('a', '1')])).toBeNull();
    expect(sendBlock([ready('a', '1'), ...addFiles([], [file('b')], newKey)])).toBe('uploading');
    expect(sendBlock([ready('a', '1'), { ...ready('b', '2'), state: 'error', error: 'failed' }])).toBe('error');
    expect(sendBlock([ready('a', '1', MAX_ATTACHMENT_BYTES), ready('b', '2', 1)])).toBe('over-total');
    expect(sendBlock([ready('a', '1', MAX_ATTACHMENT_BYTES)])).toBeNull();
  });

  it('collects ids of ready chips in order', () => {
    const chips = [ready('a', 'id-a'), { ...ready('b', ''), state: 'uploading' as const, attachmentId: undefined }, ready('c', 'id-c')];
    expect(attachmentIdsOf(chips)).toEqual(['id-a', 'id-c']);
  });

  it('reads which sent attachment IDs the server rejected', () => {
    const details = {
      issues: [
        { field: 'attachmentIds[1]', message: 'not uploaded yet' },
        { field: 'subject', message: 'x' },
        { field: 'attachmentIds[7]', message: 'out of range' },
      ],
    };
    expect(rejectedAttachmentIds(details, ['id-a', 'id-b'])).toEqual(['id-b']);
    expect(rejectedAttachmentIds(undefined, ['id-a'])).toEqual([]);
  });

  it('turns chips the server rejected on send into failed chips that upload again on retry', () => {
    const chips = [ready('a', 'id-a'), ready('b', 'id-b')];
    const failed = failAttachments(chips, ['id-b']);
    expect(failed[0]).toEqual(chips[0]);
    expect(failed[1]).toMatchObject({ state: 'error', error: 'failed' });
    expect(failed[1]).not.toHaveProperty('attachmentId');
  });
});
