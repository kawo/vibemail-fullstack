import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { MessageDTO } from '../api/types';
import { Icon } from '../components/ui';
import {
  type ComposeFields,
  type FieldIssue,
  isBlank,
  isValidAddress,
  issuesFromDetails,
  replyFields,
  splitRecipients,
  validateForSend,
} from '../lib/compose';
import {
  type DraftSnapshot,
  clearDraftSnapshot,
  clearUnsent,
  loadDraftSnapshot,
  loadUnsent,
  saveDraftSnapshot,
  saveUnsent,
} from '../lib/draftStore';
import { relativeTime } from '../lib/format';
import { asApiError, store } from '../state/store';
import type { OpenRequest } from './ComposeContext';

/** DESIGN_SPEC.md §3: the three named states. */
type Mode = 'default' | 'reply' | 'restored';
type SaveState = 'idle' | 'saving' | 'saved' | 'unsaved' | 'stopped';
type Confirm = null | { kind: 'discard' } | { kind: 'replace'; reply: MessageDTO; snapshot: DraftSnapshot };
type SendProblem = null | { kind: 'banner'; text: string; retry: boolean } | { kind: 'thread-missing'; then: 'send' | 'save' };

const AUTOSAVE_MS = 2000;
const RETRY_SAVE_MS = 10_000;
const MAX_HEIGHT_RATIO = 0.58;

interface Initial {
  mode: Mode;
  fields: ComposeFields;
  draftId: string | null;
  savedAt: string | null;
  confirm: Confirm;
}

function initialState(request: OpenRequest): Initial {
  const snapshot = loadDraftSnapshot();
  if (request.reply) {
    if (snapshot) {
      // "Replace your saved draft?" is asked before entering reply mode.
      return {
        mode: 'restored',
        fields: fromDraft(snapshot),
        draftId: snapshot.draftId,
        savedAt: snapshot.updatedAt,
        confirm: { kind: 'replace', reply: request.reply, snapshot },
      };
    }
    return { mode: 'reply', fields: replyFields(request.reply), draftId: null, savedAt: null, confirm: null };
  }
  if (snapshot) {
    return { mode: 'restored', fields: fromDraft(snapshot), draftId: snapshot.draftId, savedAt: snapshot.updatedAt, confirm: null };
  }
  const unsent = loadUnsent();
  return { mode: 'default', fields: unsent ?? { to: [], subject: '', body: '' }, draftId: null, savedAt: null, confirm: null };
}

/** Gmail gives every draft a `threadId`; only one the user replied into makes it a reply. */
function fromDraft(draft: DraftSnapshot): ComposeFields {
  return { to: draft.to, subject: draft.subject, body: draft.body, ...(draft.requestedThreadId ? { threadId: draft.requestedThreadId } : {}) };
}

/** Keeps the drawer above the software keyboard and within 58% of the viewport height. */
function useKeyboardAwareHeight(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const node = ref.current;
    const viewport = window.visualViewport;
    if (!node) {
      return;
    }
    // The viewport height before any keyboard opened: the drawer's cap is 58% of it.
    let fullHeight = window.innerHeight;
    const update = () => {
      fullHeight = Math.max(fullHeight, window.innerHeight);
      const cap = Math.round(fullHeight * MAX_HEIGHT_RATIO);
      if (!viewport) {
        node.style.setProperty('--drawer-height', `${cap}px`);
        return;
      }
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const above = viewport.height - 8;
      node.style.setProperty('--kb-offset', `${keyboard}px`);
      node.style.setProperty('--drawer-height', `${Math.max(160, Math.min(cap, above))}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref]);
}

export function ComposeDrawer({ request, onClose }: { request: OpenRequest; onClose: () => void }) {
  const [init] = useState(() => initialState(request));
  const [chips, setChips] = useState<string[]>(init.fields.to);
  const [pendingTo, setPendingTo] = useState('');
  const [subject, setSubject] = useState(init.fields.subject);
  const [body, setBody] = useState(init.fields.body);
  const [threadId, setThreadId] = useState<string | undefined>(init.fields.threadId);
  const [draftId, setDraftId] = useState<string | null>(init.draftId);
  const [savedAt, setSavedAt] = useState<string | null>(init.savedAt);
  const [saveState, setSaveState] = useState<SaveState>(init.draftId ? 'saved' : 'idle');
  const [showRestoredBanner, setShowRestoredBanner] = useState(init.mode === 'restored');
  const [confirm, setConfirm] = useState<Confirm>(init.confirm);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<SendProblem>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [edits, setEdits] = useState(0);

  const drawer = useRef<HTMLDivElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);
  const bodyInput = useRef<HTMLTextAreaElement | null>(null);
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const saving = useRef(false);
  const queued = useRef(false);
  const saveBlockedUntil = useRef(0);
  const closed = useRef(false);

  useKeyboardAwareHeight(drawer);

  const fields = useCallback(
    (): ComposeFields => ({
      to: [...chips, ...splitRecipients(pendingTo)],
      subject,
      body,
      ...(threadId ? { threadId } : {}),
    }),
    [chips, pendingTo, subject, body, threadId],
  );
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // Lock the page behind the drawer, and focus the field each state starts in.
  useEffect(() => {
    document.body.classList.add('scroll-locked');
    if (init.mode === 'reply') {
      bodyInput.current?.focus();
      bodyInput.current?.setSelectionRange(0, 0);
    } else if (init.mode === 'restored') {
      bodyInput.current?.focus();
    } else {
      toInput.current?.focus();
    }
    return () => document.body.classList.remove('scroll-locked');
  }, [init.mode]);

  // Countdown tick while Send is rate-limited.
  useEffect(() => {
    if (blockedUntil <= now) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil, now]);

  /** One draft request at a time; further changes queue a single follow-up save. */
  const save = useCallback(async (force = false): Promise<void> => {
    // Timers that fire after the drawer closed do nothing; the close itself forces one last save.
    if (closed.current && !force) {
      return;
    }
    const current = fieldsRef.current();
    if (isBlank(current) || Date.now() < saveBlockedUntil.current) {
      return;
    }
    if (saving.current) {
      queued.current = true;
      return;
    }
    saving.current = true;
    setSaveState('saving');
    const payload = { to: current.to, subject: current.subject, body: current.body, ...(current.threadId ? { threadId: current.threadId } : {}) };
    try {
      const id = draftIdRef.current;
      const { draft } = id ? await api.updateDraft(id, payload) : await api.createDraft(payload);
      draftIdRef.current = draft.draftId;
      setDraftId(draft.draftId);
      setSavedAt(draft.updatedAt);
      saveDraftSnapshot(draft, current.threadId);
      clearUnsent();
      setSaveState('saved');
    } catch (error) {
      const apiError = asApiError(error);
      if (apiError.code === 'MESSAGE_NOT_FOUND' && draftIdRef.current) {
        // Deleted elsewhere: the next save creates a new draft.
        draftIdRef.current = null;
        setDraftId(null);
        clearDraftSnapshot();
        queued.current = true;
      } else if (apiError.code === 'MESSAGE_NOT_FOUND') {
        setProblem({ kind: 'thread-missing', then: 'save' });
        setSaveState('unsaved');
      } else if (apiError.code === 'GMAIL_NOT_CONNECTED' || apiError.code === 'GMAIL_TOKEN_REVOKED') {
        saveUnsent(current);
        setSaveState('stopped');
      } else if (apiError.code === 'GMAIL_RATE_LIMITED') {
        saveBlockedUntil.current = Date.now() + (apiError.retryAfterSeconds ?? 30) * 1000;
        setSaveState('unsaved');
        window.setTimeout(() => void save(), (apiError.retryAfterSeconds ?? 30) * 1000);
      } else {
        setSaveState('unsaved');
        window.setTimeout(() => void save(), RETRY_SAVE_MS);
      }
    } finally {
      saving.current = false;
      if (queued.current) {
        queued.current = false;
        void save(true);
      }
    }
  }, []);

  // Autosave 2 s after the last edit (not before the first one). Only edits restart the debounce.
  const stopped = useRef(false);
  stopped.current = saveState === 'stopped';
  useEffect(() => {
    if (edits === 0) {
      return;
    }
    const timer = window.setTimeout(() => !stopped.current && void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [edits, save]);

  const edited = () => {
    setEdits((n) => n + 1);
    setShowRestoredBanner(false);
    setIssues([]);
    if (problem?.kind === 'banner') {
      setProblem(null);
    }
  };

  const deleteDraftQuietly = async (id: string, reportFailure: boolean) => {
    try {
      await api.deleteDraft(id);
    } catch (error) {
      if (reportFailure && asApiError(error).code !== 'MESSAGE_NOT_FOUND') {
        store.toast('Couldn’t delete the draft in Gmail');
      }
    }
  };

  const finish = () => {
    closed.current = true;
    onClose();
  };

  const close = () => {
    const current = fields();
    if (isBlank(current)) {
      // A drawer cleared to blank: closing it behaves as Discard, without the confirmation.
      if (draftIdRef.current) {
        void deleteDraftQuietly(draftIdRef.current, true);
      }
      clearDraftSnapshot();
      clearUnsent();
    } else if (saveState !== 'stopped') {
      void save(true); // A pending autosave fires immediately.
    }
    finish();
  };

  const discard = () => {
    if (draftIdRef.current) {
      void deleteDraftQuietly(draftIdRef.current, true);
    }
    clearDraftSnapshot();
    clearUnsent();
    finish();
  };

  const send = async (current: ComposeFields = fields()) => {
    const found = validateForSend(current);
    setIssues(found);
    if (found.length > 0) {
      return;
    }
    setSending(true);
    setProblem(null);
    const sentDraftId = draftIdRef.current;
    const afterSent = (text: string) => {
      if (sentDraftId) {
        void deleteDraftQuietly(sentDraftId, false);
      }
      clearDraftSnapshot();
      clearUnsent();
      store.toast(text);
      finish();
    };
    try {
      const { message } = await api.send({
        to: current.to,
        subject: current.subject,
        body: current.body,
        ...(current.threadId ? { threadId: current.threadId } : {}),
      });
      store.addToInbox(message);
      afterSent('Sent');
    } catch (error) {
      setSending(false);
      const apiError = error instanceof ApiError ? error : asApiError(error);
      switch (apiError.code) {
        case 'UNAUTHENTICATED':
        case 'GMAIL_NOT_CONNECTED':
        case 'GMAIL_TOKEN_REVOKED':
          // Keep everything typed; the sign-in screen or reconnect panel takes over.
          saveUnsent(current);
          return;
        case 'VALIDATION_FAILED':
          setIssues(issuesFromDetails(apiError.details));
          return;
        case 'MESSAGE_NOT_FOUND':
          setProblem({ kind: 'thread-missing', then: 'send' });
          return;
        case 'GMAIL_RATE_LIMITED':
          setBlockedUntil(Date.now() + (apiError.retryAfterSeconds ?? 30) * 1000);
          setNow(Date.now());
          return;
        default:
          if (typeof apiError.details?.sentGmailId === 'string') {
            // It *was* sent: never resend.
            afterSent('Sent. It may take a moment to appear');
            return;
          }
          setProblem({ kind: 'banner', text: 'Couldn’t send', retry: true });
      }
    }
  };

  const commitPending = () => {
    const parts = splitRecipients(pendingTo);
    if (parts.length > 0) {
      setChips((prev) => [...prev, ...parts]);
      setPendingTo('');
      edited();
    }
  };

  const resolveConfirmReplace = async (replace: boolean) => {
    if (confirm?.kind !== 'replace') {
      return;
    }
    if (replace) {
      void deleteDraftQuietly(confirm.snapshot.draftId, false);
      clearDraftSnapshot();
      const reply = replyFields(confirm.reply);
      draftIdRef.current = null;
      setDraftId(null);
      setSavedAt(null);
      setSaveState('idle');
      setChips(reply.to);
      setSubject(reply.subject);
      setBody(reply.body);
      setThreadId(reply.threadId);
      setShowRestoredBanner(false);
      window.setTimeout(() => {
        bodyInput.current?.focus();
        bodyInput.current?.setSelectionRange(0, 0);
      });
    }
    setConfirm(null);
  };

  const blockedFor = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  const canSend = !sending && blockedFor === 0 && fields().to.length > 0 && confirm === null;
  const issueFor = (field: FieldIssue['field']) => issues.filter((i) => i.field === field).map((i) => i.message).join(' ');
  const saveLabel = { idle: '', saving: 'Saving…', saved: 'Saved', unsaved: 'Not saved', stopped: 'Not saved' }[saveState];

  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <div
        ref={drawer}
        className={`glass-raised drawer${expanded ? ' expanded' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={threadId ? 'Reply' : 'New message'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
            e.preventDefault();
            void send();
          } else if (e.key === 'Escape') {
            close();
          }
        }}
      >
        <div className="handle" aria-hidden="true" />
        <div className="drawer-head">
          <button type="button" className="icon-btn" aria-label="Close" onClick={close} disabled={sending}>
            <Icon name="close" />
          </button>
          <div className="drawer-title">
            {threadId ? 'Reply' : 'New message'}
            <span className="save-state" aria-live="polite">
              {saveLabel}
            </span>
          </div>
          <button type="button" className="icon-btn expand-btn" aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded((v) => !v)}>
            <Icon name="expand" size={18} />
          </button>
          <button type="button" className="text-btn" onClick={() => setConfirm({ kind: 'discard' })} disabled={sending}>
            Discard
          </button>
          <button type="button" className="primary-btn" disabled={!canSend} onClick={() => void send()}>
            {sending ? <span className="spinner" /> : <Icon name="send" size={16} />}
            {blockedFor > 0 ? `Wait ${blockedFor}s` : 'Send'}
          </button>
        </div>

        {confirm?.kind === 'discard' && (
          <div className="notice">
            Discard draft?
            <button type="button" className="text-btn" onClick={discard}>
              Discard
            </button>
            <button type="button" className="text-btn" onClick={() => setConfirm(null)}>
              Keep
            </button>
          </div>
        )}
        {confirm?.kind === 'replace' && (
          <div className="notice">
            Replace your saved draft?
            <button type="button" className="text-btn" onClick={() => void resolveConfirmReplace(true)}>
              Replace
            </button>
            <button type="button" className="text-btn" onClick={() => void resolveConfirmReplace(false)}>
              Keep draft
            </button>
          </div>
        )}
        {showRestoredBanner && savedAt && confirm === null && (
          <div className="notice">
            Draft restored · saved {relativeTime(savedAt)}
            <button type="button" className="text-btn" onClick={() => setConfirm({ kind: 'discard' })}>
              Discard
            </button>
          </div>
        )}
        {problem?.kind === 'banner' && (
          <div className="notice error" role="alert">
            {problem.text}
            {problem.retry && (
              <button type="button" className="text-btn" onClick={() => void send()}>
                Retry
              </button>
            )}
          </div>
        )}
        {problem?.kind === 'thread-missing' && (
          <div className="notice error" role="alert">
            This conversation no longer exists. Send as a new message?
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                const next = { ...fields() };
                delete next.threadId;
                setThreadId(undefined);
                setProblem(null);
                if (problem.then === 'send') {
                  void send(next);
                } else {
                  edited();
                }
              }}
            >
              {problem.then === 'send' ? 'Send as new' : 'Make it a new message'}
            </button>
          </div>
        )}

        {threadId && (
          <div className="notice">
            <span className="pill">
              Replying in conversation
              <button type="button" aria-label="Stop replying in this conversation" onClick={() => (setThreadId(undefined), edited())}>
                ×
              </button>
            </span>
          </div>
        )}

        <div className="field">
          <label htmlFor="compose-to">To</label>
          <div className="recipients">
            {chips.map((address, i) => (
              <span key={`${address}-${i}`} className={`recipient${isValidAddress(address) ? '' : ' invalid'}`}>
                {address}
                <button type="button" aria-label={`Remove ${address}`} onClick={() => (setChips((prev) => prev.filter((_, j) => j !== i)), edited())}>
                  ×
                </button>
              </span>
            ))}
            <input
              id="compose-to"
              ref={toInput}
              type="text"
              inputMode="email"
              autoComplete="email"
              value={pendingTo}
              readOnly={sending}
              onChange={(e) => {
                if (/[,;]$/.test(e.target.value)) {
                  setPendingTo(e.target.value);
                  window.setTimeout(commitPending);
                } else {
                  setPendingTo(e.target.value);
                }
                edited();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commitPending();
                } else if (e.key === 'Backspace' && pendingTo === '' && chips.length > 0) {
                  setChips((prev) => prev.slice(0, -1));
                  edited();
                }
              }}
              onBlur={commitPending}
            />
          </div>
        </div>
        {issueFor('to') && <div className="field-error">{issueFor('to')}</div>}
        <div className="field">
          <label htmlFor="compose-subject">Subject</label>
          <input
            id="compose-subject"
            value={subject}
            maxLength={998}
            readOnly={sending}
            onChange={(e) => (setSubject(e.target.value.replace(/[\r\n]/g, ' ')), edited())}
          />
        </div>
        {issueFor('subject') && <div className="field-error">{issueFor('subject')}</div>}
        <textarea
          ref={bodyInput}
          className="body-field"
          aria-label="Message"
          value={body}
          readOnly={sending}
          onChange={(e) => (setBody(e.target.value), edited())}
          onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest' })}
        />
        {(issueFor('body') || issueFor('threadId')) && <div className="field-error">{issueFor('body') || issueFor('threadId')}</div>}
      </div>
    </>
  );
}
