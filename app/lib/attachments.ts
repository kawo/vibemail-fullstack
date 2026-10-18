/**
 * The compose drawer's attachment chips (DESIGN_SPEC.md §3 Attachments), as pure state changes.
 * The drawer owns the File objects and the requests; this decides what each chip shows and
 * whether Send is allowed.
 */

/** 25 MB per file and per message (CONTRACT.md §4.14, §4.3). */
export const MAX_ATTACHMENT_BYTES = 26_214_400;
export const MAX_ATTACHMENTS = 20;
const FALLBACK_TYPE = 'application/octet-stream';

export type ChipState = 'uploading' | 'ready' | 'error';
export type ChipError = 'too-large' | 'too-many' | 'failed';

export interface AttachmentChip {
  key: string;
  name: string;
  size: number;
  type: string;
  state: ChipState;
  /** Set once the upload finished (state `ready`). */
  attachmentId?: string;
  error?: ChipError;
}

/** New chips for picked files: too large and over-the-cap files never upload. */
export function addFiles(
  chips: readonly AttachmentChip[],
  files: ReadonlyArray<{ name: string; size: number; type: string }>,
  newKey: () => string,
): AttachmentChip[] {
  const added = files.map((file, i): AttachmentChip => {
    const base = { key: newKey(), name: file.name, size: file.size, type: file.type || FALLBACK_TYPE };
    if (chips.length + i >= MAX_ATTACHMENTS) {
      return { ...base, state: 'error', error: 'too-many' };
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { ...base, state: 'error', error: 'too-large' };
    }
    return { ...base, state: 'uploading' };
  });
  return [...chips, ...added];
}

/** Records an upload's outcome. A chip removed meanwhile stays removed. */
export function settle(
  chips: readonly AttachmentChip[],
  key: string,
  result: { attachmentId: string } | 'failed' | 'too-large',
): AttachmentChip[] {
  return chips.map((chip) => {
    if (chip.key !== key) {
      return chip;
    }
    const { error: _error, attachmentId: _id, ...rest } = chip;
    if (typeof result === 'object') {
      return { ...rest, state: 'ready', attachmentId: result.attachmentId };
    }
    return { ...rest, state: 'error', error: result };
  });
}

export function removeChip(chips: readonly AttachmentChip[], key: string): AttachmentChip[] {
  return chips.filter((chip) => chip.key !== key);
}

/** Back to uploading, for a chip whose upload failed; other errors can't be retried. */
export function retryChip(chips: readonly AttachmentChip[], key: string): AttachmentChip[] {
  return chips.map((chip) => {
    if (chip.key !== key || chip.error !== 'failed') {
      return chip;
    }
    const { error: _error, attachmentId: _id, ...rest } = chip;
    return { ...rest, state: 'uploading' };
  });
}

/** Chips whose upload the server rejected on send (`attachmentIds[i]` issues) fail, to be retried. */
export function failAttachments(chips: readonly AttachmentChip[], attachmentIds: readonly string[]): AttachmentChip[] {
  return chips.map((chip) => {
    if (chip.attachmentId === undefined || !attachmentIds.includes(chip.attachmentId)) {
      return chip;
    }
    const { attachmentId: _id, ...rest } = chip;
    return { ...rest, state: 'error', error: 'failed' };
  });
}

/** Why Send is disabled by the attachments, or null when they allow it. */
export function sendBlock(chips: readonly AttachmentChip[]): null | 'uploading' | 'error' | 'over-total' {
  if (chips.some((chip) => chip.state === 'uploading')) {
    return 'uploading';
  }
  if (chips.some((chip) => chip.state === 'error')) {
    return 'error';
  }
  const total = chips.reduce((sum, chip) => sum + chip.size, 0);
  return total > MAX_ATTACHMENT_BYTES ? 'over-total' : null;
}

/** The IDs to send: ready chips, in chip order. */
export function attachmentIdsOf(chips: readonly AttachmentChip[]): string[] {
  return chips.flatMap((chip) => (chip.state === 'ready' && chip.attachmentId ? [chip.attachmentId] : []));
}
