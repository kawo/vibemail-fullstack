import { useId } from 'react';
import { BodyField } from './BodyField';
import { ComposeHeader } from './ComposeHeader';
import { RecipientField } from './RecipientField';
import type { ComposeActions, ComposeNoticeView, ComposeRefs, ComposeView } from './types';

function Notice({ notice }: { notice: ComposeNoticeView }) {
  return (
    <div className={`notice${notice.tone === 'error' ? ' error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
      <span className="notice-text">{notice.text}</span>
      {notice.actions.map((action) => (
        <button key={action.label} type="button" className={action.primary ? 'secondary-btn' : 'text-btn'} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The compose sheet (DESIGN_SPEC.md §3), purely presentational:
 *
 *   drag handle
 *   ComposeHeader   title · save status ……… Save draft · Send · close     (pinned)
 *   notice          a confirmation, prompt or error, when there is one    (pinned)
 *   compose-scroll  one scrolling area:
 *     reply pill      "Replying in conversation", removable
 *     RecipientField  To, tag-style (locked in reply mode)
 *     Subject
 *     BodyField       text, quoted excerpt, "Discard draft" chip
 *
 * `placement="overlay"` is the real drawer (fixed, keyboard-aware); `"inline"` lays it out in
 * place for the gallery.
 */
export function ComposeSheet({
  view,
  actions,
  refs = {},
  placement = 'overlay',
  onKeyDown,
}: {
  view: ComposeView;
  actions: ComposeActions;
  refs?: ComposeRefs;
  placement?: 'overlay' | 'inline';
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const id = useId();
  const title = view.replying ? 'Reply' : view.mode === 'restored' ? 'Draft' : 'New message';
  return (
    <div
      ref={refs.sheet}
      className={`glass-raised drawer sheet mode-${view.mode}${view.expanded ? ' expanded' : ''}${placement === 'inline' ? ' inline' : ''}`}
      role="dialog"
      aria-modal={placement === 'overlay' ? true : undefined}
      aria-label={title}
      onKeyDown={onKeyDown}
    >
      <div className="handle" aria-hidden="true" />
      <ComposeHeader
        title={title}
        saveStatus={view.saveStatus}
        sending={view.sending}
        waitSeconds={view.waitSeconds}
        canSend={view.canSend}
        canSaveDraft={view.canSaveDraft}
        expanded={view.expanded}
        onSaveDraft={actions.onSaveDraft}
        onSend={actions.onSend}
        onClose={actions.onClose}
        onToggleExpand={actions.onToggleExpand}
      />
      {view.notice && <Notice notice={view.notice} />}
      {/* Everything below the header scrolls as one, so the body is always reachable however
          many recipients there are or however little room the keyboard leaves. */}
      <div className="compose-scroll">
        {view.replying && (
          <div className="notice plain">
            <span className="pill">
              Replying in conversation
              <button type="button" aria-label="Stop replying in this conversation" onClick={actions.onLeaveConversation}>
                x
              </button>
            </span>
          </div>
        )}
        <RecipientField
          recipients={view.recipients}
          pendingTo={view.pendingTo}
          locked={view.replying}
          readOnly={view.sending}
          error={view.issues.to}
          inputRef={refs.toInput}
          onPendingChange={actions.onPendingToChange}
          onCommit={actions.onCommitTo}
          onRemove={actions.onRemoveRecipient}
          onRemoveLast={actions.onRemoveLastRecipient}
        />
        <div className={`field${view.issues.subject ? ' invalid' : ''}`}>
          <label htmlFor={`${id}-subject`}>Subject</label>
          <input
            id={`${id}-subject`}
            value={view.subject}
            maxLength={998}
            readOnly={view.sending}
            aria-invalid={view.issues.subject ? true : undefined}
            aria-describedby={view.issues.subject ? `${id}-subject-error` : undefined}
            onChange={(e) => actions.onSubjectChange(e.target.value.replace(/[\r\n]/g, ' '))}
          />
        </div>
        {view.issues.subject && (
          <div className="field-error" id={`${id}-subject-error`} role="alert">
            {view.issues.subject}
          </div>
        )}
        <BodyField
          text={view.text}
          quote={view.quote}
          restoredAt={view.restoredAt}
          readOnly={view.sending}
          error={view.issues.body}
          inputRef={refs.textInput}
          onChange={actions.onTextChange}
          onDiscardDraft={actions.onDiscardDraft}
        />
      </div>
    </div>
  );
}
