import type { AttachmentChip, ChipError } from '@/app/lib/attachments';
import { formatSize } from '@/app/lib/format';
import { Icon } from '@/app/components/icons';

const ERROR_TEXT: Record<ChipError, string> = {
  'too-large': 'Larger than 25 MB',
  'too-many': 'At most 20 attachments',
  failed: 'Upload failed',
};

/**
 * One chip per picked file, under the body (DESIGN_SPEC.md §3 Attachments): name, size, a spinner
 * while uploading, the reason in red on error (Retry for a failed upload), and remove. Below them,
 * why Send is held back, and that attachments aren't saved with drafts.
 */
export function AttachmentChips({
  chips,
  blockHint,
  disabled,
  onRemove,
  onRetry,
}: {
  chips: readonly AttachmentChip[];
  blockHint: string | null;
  disabled: boolean;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="compose-attachments">
      <ul className="attachment-chips" aria-label="Attachments">
        {chips.map((chip) => (
          <li
            key={chip.key}
            className={`attachment-chip ${chip.state}`}
            aria-busy={chip.state === 'uploading' ? true : undefined}
          >
            {chip.state === 'uploading' ? (
              <span className="spinner" aria-label="Uploading" />
            ) : (
              <Icon name="paperclip" className="attachment-glyph" />
            )}
            <span className="attachment-name" title={chip.name}>
              {chip.name}
            </span>
            <span className="attachment-size">{formatSize(chip.size)}</span>
            {chip.state === 'error' && <span className="attachment-error">{ERROR_TEXT[chip.error ?? 'failed']}</span>}
            {chip.error === 'failed' && (
              <button type="button" className="text-btn attachment-retry" disabled={disabled} onClick={() => onRetry(chip.key)}>
                Retry
              </button>
            )}
            <button
              type="button"
              className="attachment-remove"
              aria-label={`Remove ${chip.name}`}
              title={`Remove ${chip.name}`}
              disabled={disabled}
              onClick={() => onRemove(chip.key)}
            >
              x
            </button>
          </li>
        ))}
      </ul>
      <p className="attachment-hint" role="status">
        {blockHint ? `${blockHint} · ` : ''}Attachments aren’t saved with drafts
      </p>
    </div>
  );
}
