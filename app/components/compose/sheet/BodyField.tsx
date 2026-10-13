import { type RefObject, useId } from 'react';
import { relativeTime } from '@/app/lib/format';

/**
 * The body: a plain-text area that grows with its content, the reply quote below it at reduced
 * strength (read-only; it is sent joined under the text), and, for a restored draft, the
 * "Discard draft" chip until the first edit (DESIGN_SPEC.md §3).
 */
export function BodyField({
  text,
  quote,
  restoredAt,
  restoredLabel = 'Draft restored',
  readOnly,
  error,
  inputRef,
  onChange,
  onDiscardDraft,
}: {
  text: string;
  quote: string | null;
  restoredAt: string | null;
  restoredLabel?: string;
  readOnly: boolean;
  error: string | undefined;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  onDiscardDraft: () => void;
}) {
  const id = useId();
  return (
    <div className="body-area">
      <textarea
        ref={inputRef}
        className="body-field"
        aria-label="Message"
        placeholder={quote ? 'Write your reply' : 'Write your message'}
        value={text}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-body-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest' })}
      />
      {error && (
        <div className="field-error" id={`${id}-body-error`} role="alert">
          {error}
        </div>
      )}
      {quote && (
        <blockquote className="quote-excerpt" aria-label="Quoted message">
          {quote}
        </blockquote>
      )}
      {restoredAt && (
        <div className="restored-row">
          <span className="restored-note">{restoredLabel} · saved {relativeTime(restoredAt)}</span>
          <button type="button" className="restored-chip" onClick={onDiscardDraft}>
            Discard draft
          </button>
        </div>
      )}
    </div>
  );
}
