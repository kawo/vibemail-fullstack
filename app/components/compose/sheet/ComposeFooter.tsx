import { useRef } from 'react';
import { Icon } from '@/app/components/icons';

/**
 * The compose sheet's pinned footer (DESIGN_SPEC.md §3 Attachments): "Attach files" opens the
 * native picker, several files at once. The input is cleared after each pick, so the same file
 * can be picked again.
 */
export function ComposeFooter({ disabled, onAttachFiles }: { disabled: boolean; onAttachFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <div className="compose-footer">
      <button
        type="button"
        className="icon-btn"
        aria-label="Attach files"
        title="Attach files"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Icon name="paperclip" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) {
            onAttachFiles(files);
          }
        }}
      />
    </div>
  );
}
