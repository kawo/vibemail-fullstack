import { useState } from 'react';
import type { DraftDTO } from '@/app/services/types';
import { draftRecipients, draftSnippet } from '@/app/lib/drafts';
import { relativeTime } from '@/app/lib/format';
import { Icon } from '@/app/components/icons';
import { Glyph } from '@/app/components/ui';

/**
 * One draft (DESIGN_SPEC.md §4 Drafts), on the inbox row's grid: the draft mark where a row has its
 * star, the recipients where it has the sender, when it was last saved, then subject — body.
 * Opening it opens the compose drawer on it; the row menu discards it.
 */
export function DraftRow({
  draft,
  pending,
  onOpen,
  onDiscard,
}: {
  draft: DraftDTO;
  pending: boolean;
  onOpen: (draft: DraftDTO) => void;
  onDiscard: (draft: DraftDTO) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const recipients = draftRecipients(draft);
  const subject = draft.subject || '(no subject)';
  const snippet = draftSnippet(draft);

  return (
    <article
      className={`row draft-row${pending ? ' pending' : ''}`}
      tabIndex={0}
      aria-label={`Draft to ${recipients}: ${subject}`}
      onClick={() => !menuOpen && onOpen(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          onOpen(draft);
        }
      }}
    >
      <span className="draft-mark" aria-hidden="true">
        <Icon name="draft" />
      </span>
      <div className="from">{recipients}</div>
      <div className="meta">
        <time dateTime={draft.updatedAt} title={new Date(draft.updatedAt).toLocaleString()}>
          {relativeTime(draft.updatedAt)}
        </time>
        <button
          type="button"
          className="icon-btn more"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <Glyph name="more" />
        </button>
      </div>
      <div className="line">
        <span className="subject">{subject}</span>
        {snippet && (
          <>
            <span className="dash" aria-hidden="true">
              {' — '}
            </span>
            <span className="snippet">{snippet}</span>
          </>
        )}
      </div>
      {menuOpen && (
        <div className="glass-raised menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), onOpen(draft))}>
            Open
          </button>
          <div className="rule" role="separator" />
          <button type="button" role="menuitem" className="danger" onClick={() => (setMenuOpen(false), onDiscard(draft))}>
            <Icon name="trash" /> Discard draft
          </button>
          <button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}
