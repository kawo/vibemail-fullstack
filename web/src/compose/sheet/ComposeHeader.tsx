import { Glyph } from '../../components/ui';
import type { SaveStatus } from './types';

/**
 * The pinned header (DESIGN_SPEC.md §3): title and the quiet save status on the left; Save draft,
 * Send and close on the right. It never scrolls away, so Send stays reachable above the keyboard.
 */
export function ComposeHeader({
  title,
  saveStatus,
  sending,
  waitSeconds,
  canSend,
  canSaveDraft,
  expanded,
  onSaveDraft,
  onSend,
  onClose,
  onToggleExpand,
}: {
  title: string;
  saveStatus: SaveStatus | null;
  sending: boolean;
  waitSeconds: number;
  canSend: boolean;
  canSaveDraft: boolean;
  expanded: boolean;
  onSaveDraft: () => void;
  onSend: () => void;
  onClose: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className="drawer-head">
      <div className="drawer-title">
        <span>{title}</span>
        <span className={`save-state ${saveStatus?.tone ?? 'quiet'}`} aria-live="polite">
          {saveStatus?.tone === 'ok' && <Glyph name="done" className="ok" />} {saveStatus?.text}
        </span>
      </div>
      <button type="button" className="icon-btn expand-btn" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={onToggleExpand}>
        <Glyph name={expanded ? 'collapse' : 'expand'} />
      </button>
      <button type="button" className="secondary-btn" disabled={!canSaveDraft} onClick={onSaveDraft}>
        Save draft
      </button>
      <button type="button" className="send-btn" disabled={!canSend} onClick={onSend} aria-keyshortcuts="Control+Enter Meta+Enter">
        {sending && <span className="spinner" />}
        {waitSeconds > 0 ? `Wait ${waitSeconds}s` : sending ? 'Sending' : 'Send'}
      </button>
      <button type="button" className="icon-btn close-btn" aria-label="Close" onClick={onClose} disabled={sending}>
        <Glyph name="close" />
      </button>
    </div>
  );
}
