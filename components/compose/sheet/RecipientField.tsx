import { type RefObject, useId } from 'react';
import { isValidAddress } from '@/lib/compose';

/**
 * The To field with tag-style entry: each address becomes a chip on comma, semicolon, Enter or
 * blur; Backspace in the empty input removes the last chip. An invalid address stays as a red
 * chip. Read-only in reply mode: the chips show without remove buttons and there is no input.
 */
export function RecipientField({
  recipients,
  pendingTo,
  readOnly,
  locked,
  error,
  inputRef,
  onPendingChange,
  onCommit,
  onRemove,
  onRemoveLast,
}: {
  recipients: readonly string[];
  pendingTo: string;
  /** No input at all (reply mode). */
  locked: boolean;
  /** Input present but not editable (while sending). */
  readOnly: boolean;
  error: string | undefined;
  inputRef?: RefObject<HTMLInputElement | null>;
  onPendingChange: (value: string) => void;
  onCommit: () => void;
  onRemove: (index: number) => void;
  onRemoveLast: () => void;
}) {
  const id = useId();
  return (
    <>
      <div className={`field${error ? ' invalid' : ''}${locked ? ' locked' : ''}`}>
        <label htmlFor={`${id}-to`} id={`${id}-to-label`}>
          To
        </label>
        <div className="recipients" role={locked ? 'list' : undefined} aria-labelledby={`${id}-to-label`}>
          {recipients.map((address, i) => (
            <span
              key={`${address}-${i}`}
              role={locked ? 'listitem' : undefined}
              className={`recipient${isValidAddress(address) ? '' : ' invalid'}`}
              title={isValidAddress(address) ? address : `${address} isn’t a valid address`}
            >
              {address}
              {!locked && !readOnly && (
                <button type="button" aria-label={`Remove ${address}`} onClick={() => onRemove(i)}>
                  x
                </button>
              )}
            </span>
          ))}
          {!locked && (
            <input
              id={`${id}-to`}
              ref={inputRef}
              type="text"
              inputMode="email"
              autoComplete="email"
              placeholder={recipients.length === 0 ? 'name@example.com' : undefined}
              value={pendingTo}
              readOnly={readOnly}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-to-error` : undefined}
              onChange={(e) => {
                onPendingChange(e.target.value);
                if (/[,;]$/.test(e.target.value)) {
                  window.setTimeout(onCommit);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  onCommit();
                } else if (e.key === 'Backspace' && pendingTo === '' && recipients.length > 0) {
                  onRemoveLast();
                }
              }}
              onBlur={onCommit}
            />
          )}
        </div>
      </div>
      {error && (
        <div className="field-error" id={`${id}-to-error`} role="alert">
          {error}
        </div>
      )}
    </>
  );
}
