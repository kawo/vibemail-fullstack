import { type ReactNode, useState } from 'react';
import { splitRecipients } from '../lib/compose';
import { ComposeSheet } from '../compose/sheet/ComposeSheet';
import type { ComposeView } from '../compose/sheet/types';

/**
 * The compose drawer's states side by side (DESIGN_SPEC.md §3), rendered from the same
 * `ComposeSheet` the app uses, with sample content. Typing, tag entry and the reply pill work in
 * each frame; Send and Save draft do nothing here.
 */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const BASE: ComposeView = {
  mode: 'default',
  replying: false,
  recipients: [],
  pendingTo: '',
  subject: '',
  text: '',
  quote: null,
  saveStatus: null,
  restoredAt: null,
  issues: {},
  notice: null,
  sending: false,
  waitSeconds: 0,
  canSend: true,
  canSaveDraft: true,
  expanded: false,
};

const STANDUP_QUOTE = [
  'On Sun, 11 Oct 2026 09:02:14 +0400, Marcus Hale <marcus@northwind.example> wrote:',
  '> Notes from this morning:',
  '> - Release train moves to Thursday',
  '> - API latency follow-up still needs an owner',
  '> - Design crit at 15:00 in 4B',
].join('\n');

const notice = (tone: 'info' | 'error', text: string, ...labels: string[]) => ({
  tone,
  text,
  actions: labels.map((label, i) => ({ label, onClick: () => undefined, primary: i === 0 })),
});

const STATES: { title: string; note: string; view: ComposeView }[] = [
  {
    title: 'Default',
    note: 'New message. To takes addresses as tags: type one, then comma or Enter.',
    view: {
      ...BASE,
      recipients: ['priya@northwind.example', 'Dana Kim <dana@northwind.example>'],
      pendingTo: 'tomas@north',
      subject: 'Q4 planning kickoff',
      text: 'Hi both,\n\nCan we lock the Q4 kickoff for Tuesday at 10:00? I’ll bring the draft roadmap.\n\nThanks',
    },
  },
  {
    title: 'Reply mode',
    note: 'To is fixed to the sender. The quoted message sits under the body and is sent with it.',
    view: {
      ...BASE,
      mode: 'reply',
      replying: true,
      recipients: ['Marcus Hale <marcus@northwind.example>'],
      subject: 'Re: Morning standup notes',
      text: 'Thanks Marcus. I’ll take the API latency follow-up and report back Wednesday.',
      quote: STANDUP_QUOTE,
      saveStatus: { text: 'Saved', tone: 'ok' },
    },
  },
  {
    title: 'Draft restored',
    note: 'Reopened from the last saved draft. The chip disappears at the first edit.',
    view: {
      ...BASE,
      mode: 'restored',
      recipients: ['Dana Kim <dana@northwind.example>'],
      subject: 'Interview feedback: systems loop',
      text: 'Strong on queues and backpressure; walked through retries without prompting.\n\nLess sure on capacity planning. I’d lean hire, pending the design round.',
      saveStatus: { text: 'Saved', tone: 'ok' },
      restoredAt: hoursAgo(3),
    },
  },
];

const ERRORS: { title: string; note: string; view: ComposeView }[] = [
  {
    title: 'Invalid recipient',
    note: 'VALIDATION_FAILED, or the same check before sending: the message shows under its field.',
    view: {
      ...BASE,
      recipients: ['marcus@northwind.example', 'legal@northwind'],
      subject: 'Signed contract',
      text: 'Attached is the countersigned copy.',
      issues: { to: 'Not a valid address: legal@northwind' },
    },
  },
  {
    title: 'Couldn’t send',
    note: 'GMAIL_UPSTREAM_ERROR or INTERNAL without sentGmailId. Everything typed stays.',
    view: {
      ...BASE,
      recipients: ['priya@northwind.example'],
      subject: 'Lunch?',
      text: 'Thai place on 4th at 12:30?',
      notice: notice('error', 'Couldn’t send', 'Retry'),
      saveStatus: { text: 'Saved', tone: 'ok' },
    },
  },
  {
    title: 'Rate limited',
    note: 'GMAIL_RATE_LIMITED: Send waits out Retry-After, counting down.',
    view: {
      ...BASE,
      recipients: ['finance@northwind.example'],
      subject: 'Re: Q3 budget sign-off',
      text: 'Signed off. One question on line 14.',
      notice: notice('error', 'Gmail is busy. You can send again in 12s.'),
      waitSeconds: 12,
      canSend: false,
    },
  },
  {
    title: 'Conversation gone',
    note: 'MESSAGE_NOT_FOUND for the threadId: offer to send it as a new message.',
    view: {
      ...BASE,
      mode: 'reply',
      replying: true,
      recipients: ['Lena Ortiz <lena@northwind.example>'],
      subject: 'Re: Offsite agenda, v3',
      text: 'Works for me.',
      notice: notice('error', 'This conversation no longer exists. Send as a new message?', 'Send as new'),
    },
  },
  {
    title: 'Draft not saved',
    note: 'A failed autosave is quiet: the label changes and it retries on the next edit or in 10 s.',
    view: {
      ...BASE,
      recipients: ['ana@northwind.example'],
      subject: 'Cursor stability',
      text: 'Short answer: yes, the cursor is stable across refreshes.',
      saveStatus: { text: 'Not saved', tone: 'warn' },
    },
  },
  {
    title: 'Sending',
    note: 'Send shows progress; fields are read-only; close and discard wait for the result.',
    view: {
      ...BASE,
      recipients: ['tomas@northwind.example'],
      subject: 'Re: Trip receipts',
      text: 'Got them, thanks. Filing today.',
      sending: true,
      canSend: false,
      canSaveDraft: false,
    },
  },
];

const CONFIRMS: { title: string; note: string; view: ComposeView }[] = [
  {
    title: 'Discard draft?',
    note: 'From the chip or Discard: deletes the Gmail draft and clears the saved copy.',
    view: {
      ...BASE,
      mode: 'restored',
      recipients: ['Dana Kim <dana@northwind.example>'],
      subject: 'Interview feedback: systems loop',
      text: 'Strong on queues and backpressure.',
      notice: notice('info', 'Discard draft?', 'Discard', 'Keep'),
      canSend: false,
    },
  },
  {
    title: 'Replace saved draft?',
    note: 'Opening a reply while a draft is saved asks first.',
    view: {
      ...BASE,
      mode: 'restored',
      recipients: ['Dana Kim <dana@northwind.example>'],
      subject: 'Interview feedback: systems loop',
      text: 'Strong on queues and backpressure.',
      notice: notice('info', 'Replace your saved draft?', 'Replace', 'Keep draft'),
      canSend: false,
    },
  },
];

const INBOX = [
  ['Lena Ortiz', 'Offsite agenda, v3', 'Moved the retro to Thursday so ops can join'],
  ['Marcus Hale', 'Morning standup notes', 'Release train moves to Thursday'],
  ['Dana Kim', 'Hiring loop — Friday', 'Can you take the systems interview at 2?'],
  ['build-bot', 'Nightly passed', 'All 412 checks green on main'],
  ['Finance Ops', 'Q3 budget sign-off', 'Final numbers attached for review'],
  ['Priya N.', 'Lunch?', 'Thai place opened on 4th'],
];

/** A frame: a slice of the inbox, dimmed by the scrim, with the sheet risen over it. */
function Frame({ index, title, note, initial }: { index?: number; title: string; note: string; initial: ComposeView }) {
  const [view, setView] = useState(initial);
  const set = (patch: Partial<ComposeView>) => setView((v) => ({ ...v, ...patch, restoredAt: null }));
  const commit = () => {
    const parts = splitRecipients(view.pendingTo);
    if (parts.length) {
      setView((v) => ({ ...v, recipients: [...v.recipients, ...parts], pendingTo: '' }));
    }
  };
  return (
    <figure className="frame">
      <figcaption>
        <span className="frame-title">
          {index !== undefined && <span className="frame-index">{index}</span>}
          {title}
        </span>
        <span className="frame-note">{note}</span>
      </figcaption>
      <div className="frame-screen">
        <div className="frame-inbox" aria-hidden="true">
          {INBOX.map(([from, subject, snippet]) => (
            <div key={from} className="row">
              <span className="star" />
              <span className="from">{from}</span>
              <span className="meta">2 h ago</span>
              <span className="line">
                <span className="subject">{subject}</span>
                <span className="dash"> — </span>
                <span className="snippet">{snippet}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="frame-scrim" aria-hidden="true" />
        <div className="frame-sheet">
          <ComposeSheet
            placement="inline"
            view={view}
            actions={{
              onPendingToChange: (pendingTo) => setView((v) => ({ ...v, pendingTo })),
              onCommitTo: commit,
              onRemoveRecipient: (i) => setView((v) => ({ ...v, recipients: v.recipients.filter((_, j) => j !== i) })),
              onRemoveLastRecipient: () => setView((v) => ({ ...v, recipients: v.recipients.slice(0, -1) })),
              onSubjectChange: (subject) => set({ subject }),
              onTextChange: (text) => set({ text }),
              onLeaveConversation: () => setView((v) => ({ ...v, replying: false })),
              onDiscardDraft: () => setView((v) => ({ ...v, notice: notice('info', 'Discard draft?', 'Discard', 'Keep') })),
              onSaveDraft: () => setView((v) => ({ ...v, saveStatus: { text: 'Saved', tone: 'ok' } })),
              onSend: () => undefined,
              onClose: () => setView(initial),
              onToggleExpand: () => undefined,
            }}
          />
        </div>
      </div>
    </figure>
  );
}

function Section({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <section className="gallery-section">
      <h2>{title}</h2>
      <p className="gallery-intro">{intro}</p>
      <div className="frames">{children}</div>
    </section>
  );
}

export function ComposeGallery() {
  return (
    <main className="gallery">
      <header className="gallery-head">
        <h1>Compose drawer</h1>
        <p>
          The three states from DESIGN_SPEC.md §3, then its error states and confirmations. Each frame is the live
          <code> ComposeSheet</code> component over a dimmed inbox, with sample mail. You can type in any frame; Send
          and Save draft do nothing here.
        </p>
      </header>
      <Section title="States" intro="Default, reply mode and draft restored.">
        {STATES.map((s, i) => (
          <Frame key={s.title} index={i + 1} title={s.title} note={s.note} initial={s.view} />
        ))}
      </Section>
      <Section
        title="Error states"
        intro={
          <>
            What the drawer shows for each failure in §3. Three outcomes happen outside it: UNAUTHENTICATED goes to sign-in,
            GMAIL_NOT_CONNECTED opens the reconnect panel with the text kept, and a send that went through despite an error
            closes with “Sent. It may take a moment to appear”.
          </>
        }
      >
        {ERRORS.map((s) => (
          <Frame key={s.title} title={s.title} note={s.note} initial={s.view} />
        ))}
      </Section>
      <Section title="Confirmations" intro="Asked in the drawer itself, never in a browser dialog.">
        {CONFIRMS.map((s) => (
          <Frame key={s.title} title={s.title} note={s.note} initial={s.view} />
        ))}
      </Section>
    </main>
  );
}
