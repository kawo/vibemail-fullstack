import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import type { MessageDTO } from '../api/types';
import {
  type ComposeFields,
  type FieldIssue,
  isBlank,
  issuesFromDetails,
  joinQuote,
  replyFields,
  splitQuote,
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
import { asApiError, store } from '../state/store';
import type { OpenRequest } from './ComposeContext';
import { ComposeSheet } from './sheet/ComposeSheet';
import type { ComposeNoticeView, ComposeView, SaveStatus } from './sheet/types';

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
  // The reply quote is shown as its own block and joined back under the text on save and send.
  const [initBody] = useState(() => splitQuote(init.fields.body));
  const [text, setText] = useState(initBody.text);
  const [quote, setQuote] = useState<string | null>(initBody.quote);
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
  const textInput = useRef<HTMLTextAreaElement | null>(null);
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
      body: joinQuote(text, quote),
      ...(threadId ? { threadId } : {}),
    }),
    [chips, pendingTo, subject, text, quote, threadId],
  );
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  // Lock the page behind the drawer, and focus the field each state starts in.
  useEffect(() => {
    document.body.classList.add('scroll-locked');
    if (init.mode === 'reply') {
      textInput.current?.focus();
      textInput.current?.setSelectionRange(0, 0);
    } else if (init.mode === 'restored') {
      textInput.current?.focus();
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
      const split = splitQuote(reply.body);
      setText(split.text);
      setQuote(split.quote);
      setThreadId(reply.threadId);
      setShowRestoredBanner(false);
      window.setTimeout(() => {
        textInput.current?.focus();
        textInput.current?.setSelectionRange(0, 0);
      });
    }
    setConfirm(null);
  };

  const blockedFor = Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  const current = fields();
  const canSend = !sending && blockedFor === 0 && current.to.length > 0 && confirm === null;
  const issueFor = (field: FieldIssue['field']) => issues.filter((i) => i.field === field).map((i) => i.message).join(' ') || undefined;

  const saveStatus: SaveStatus | null = {
    idle: null,
    saving: { text: 'Saving…', tone: 'quiet' },
    saved: { text: 'Saved', tone: 'ok' },
    unsaved: { text: 'Not saved', tone: 'warn' },
    stopped: { text: 'Not saved', tone: 'warn' },
  }[saveState] as SaveStatus | null;

  // One line under the header, most urgent first: a confirmation, a send problem, a rate limit.
  let notice: ComposeNoticeView | null = null;
  if (confirm?.kind === 'discard') {
    notice = { tone: 'info', text: 'Discard draft?', actions: [{ label: 'Discard', onClick: discard, primary: true }, { label: 'Keep', onClick: () => setConfirm(null) }] };
  } else if (confirm?.kind === 'replace') {
    notice = {
      tone: 'info',
      text: 'Replace your saved draft?',
      actions: [
        { label: 'Replace', onClick: () => void resolveConfirmReplace(true), primary: true },
        { label: 'Keep draft', onClick: () => void resolveConfirmReplace(false) },
      ],
    };
  } else if (problem?.kind === 'banner') {
    notice = { tone: 'error', text: problem.text, actions: problem.retry ? [{ label: 'Retry', onClick: () => void send(), primary: true }] : [] };
  } else if (problem?.kind === 'thread-missing') {
    const then = problem.then;
    notice = {
      tone: 'error',
      text: 'This conversation no longer exists. Send as a new message?',
      actions: [
        {
          label: then === 'send' ? 'Send as new' : 'Make it a new message',
          primary: true,
          onClick: () => {
            const next = { ...fields() };
            delete next.threadId;
            setThreadId(undefined);
            setProblem(null);
            if (then === 'send') {
              void send(next);
            } else {
              edited();
            }
          },
        },
      ],
    };
  } else if (blockedFor > 0) {
    notice = { tone: 'error', text: `Gmail is busy. You can send again in ${blockedFor}s.`, actions: [] };
  }

  const view: ComposeView = {
    mode: init.mode,
    replying: threadId !== undefined,
    recipients: chips,
    pendingTo,
    subject,
    text,
    quote,
    saveStatus,
    restoredAt: showRestoredBanner && confirm === null ? savedAt : null,
    issues: { to: issueFor('to'), subject: issueFor('subject'), body: issueFor('body') ?? issueFor('threadId') },
    notice,
    sending,
    waitSeconds: blockedFor,
    canSend,
    canSaveDraft: !sending && !isBlank(current) && saveState !== 'saving',
    expanded,
  };

  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <ComposeSheet
        view={view}
        refs={{ sheet: drawer, toInput, textInput }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSend) {
            e.preventDefault();
            void send();
          } else if (e.key === 'Escape') {
            close();
          }
        }}
        actions={{
          onPendingToChange: (value) => (setPendingTo(value), edited()),
          onCommitTo: commitPending,
          onRemoveRecipient: (index) => (setChips((prev) => prev.filter((_, j) => j !== index)), edited()),
          onRemoveLastRecipient: () => (setChips((prev) => prev.slice(0, -1)), edited()),
          onSubjectChange: (value) => (setSubject(value), edited()),
          onTextChange: (value) => (setText(value), edited()),
          onLeaveConversation: () => (setThreadId(undefined), edited()),
          onDiscardDraft: () => setConfirm({ kind: 'discard' }),
          onSaveDraft: () => void save(true),
          onSend: () => void send(),
          onClose: close,
          onToggleExpand: () => setExpanded((v) => !v),
        }}
      />
    </>
  );
}
