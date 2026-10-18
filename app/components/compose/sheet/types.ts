import type { RefObject } from 'react';
import type { AttachmentChip } from '@/app/lib/attachments';

/**
 * What the compose sheet shows. The sheet only renders this; `ComposeDrawer` owns the state,
 * autosave and sending (DESIGN_SPEC.md §3), and the gallery feeds it fixed examples.
 */

/** The three named states of §3. */
/** DESIGN_SPEC.md §3's three states; ComposeDrawer's `mode` prop. */
export type ComposeMode = 'new' | 'reply' | 'draft-restored';

export interface SaveStatus {
  text: string;
  tone: 'quiet' | 'ok' | 'warn';
}

export interface NoticeAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

/** A line under the header: a confirmation, a prompt or an error (§3 Error states). */
export interface ComposeNoticeView {
  tone: 'info' | 'error';
  text: string;
  actions: NoticeAction[];
}

export interface ComposeView {
  mode: ComposeMode;
  /** Reply mode: To is locked to the replied sender until "Replying in conversation" is removed. */
  replying: boolean;
  recipients: readonly string[];
  pendingTo: string;
  subject: string;
  /** What the user writes; the quote is shown separately and joined back on send. */
  text: string;
  quote: string | null;
  saveStatus: SaveStatus | null;
  /** Draft restored: when it was saved (the chip shows until the first edit). */
  restoredAt: string | null;
  /** The note's words: "Draft restored" (this device's last draft) or "Draft" (opened from Drafts). */
  restoredLabel?: string;
  issues: { to?: string; subject?: string; body?: string };
  notice: ComposeNoticeView | null;
  sending: boolean;
  /** Seconds left while Gmail rate-limits sending; 0 when Send is allowed. */
  waitSeconds: number;
  canSend: boolean;
  canSaveDraft: boolean;
  expanded: boolean;
  /** v1.3: one chip per picked file (§3 Attachments). */
  attachments: readonly AttachmentChip[];
  /** Why the attachments hold Send back, or null. */
  attachHint: string | null;
}

export interface ComposeActions {
  onPendingToChange: (value: string) => void;
  onCommitTo: () => void;
  onRemoveRecipient: (index: number) => void;
  onRemoveLastRecipient: () => void;
  onSubjectChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onLeaveConversation: () => void;
  onDiscardDraft: () => void;
  onSaveDraft: () => void;
  onSend: () => void;
  onClose: () => void;
  onToggleExpand: () => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (key: string) => void;
  onRetryAttachment: (key: string) => void;
}

export interface ComposeRefs {
  sheet?: RefObject<HTMLDivElement | null>;
  toInput?: RefObject<HTMLInputElement | null>;
  textInput?: RefObject<HTMLTextAreaElement | null>;
}
