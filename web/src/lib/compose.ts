import type { MessageDTO } from '../api/types';

/** Compose drawer rules (DESIGN_SPEC.md §3) that don't depend on the UI. */

export interface ComposeFields {
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
}

export const MAX_RECIPIENTS = 100;
export const MAX_SUBJECT = 998;

const ADDR_SPEC = /^[^\s@<>",;:\\]+@[^\s@<>",;:\\]+\.[^\s@<>",;:\\]+$/;
const NAME_ADDR = /^(?:"[^"\r\n]*"|[^<>"\r\n]*?)\s*<([^<>\s]+)>$/;

/** The same address rule as the engine (CONTRACT.md §4.3). */
export function isValidAddress(value: string): boolean {
  if (/[\r\n]/.test(value)) {
    return false;
  }
  const trimmed = value.trim();
  const named = NAME_ADDR.exec(trimmed);
  return ADDR_SPEC.test(named ? (named[1] ?? '') : trimmed);
}

export interface FieldIssue {
  field: 'to' | 'subject' | 'body' | 'threadId';
  message: string;
}

/** Client-side check before Send, mirroring CONTRACT.md §4.3. */
export function validateForSend(fields: ComposeFields): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (fields.to.length === 0) {
    issues.push({ field: 'to', message: 'Add at least one recipient.' });
  } else if (fields.to.length > MAX_RECIPIENTS) {
    issues.push({ field: 'to', message: `Use ${MAX_RECIPIENTS} recipients or fewer.` });
  } else {
    const bad = fields.to.filter((a) => !isValidAddress(a));
    if (bad.length > 0) {
      issues.push({ field: 'to', message: `Not a valid address: ${bad.join(', ')}` });
    }
  }
  if (/[\r\n]/.test(fields.subject)) {
    issues.push({ field: 'subject', message: 'The subject can’t contain line breaks.' });
  } else if (fields.subject.length > MAX_SUBJECT) {
    issues.push({ field: 'subject', message: `Use ${MAX_SUBJECT} characters or fewer.` });
  }
  return issues;
}

/** Maps `details.issues` from a `VALIDATION_FAILED` envelope onto the drawer's fields. */
export function issuesFromDetails(details: Record<string, unknown> | undefined): FieldIssue[] {
  const raw = Array.isArray(details?.issues) ? (details.issues as Array<{ field?: unknown; message?: unknown }>) : [];
  return raw.map((issue) => {
    const name = typeof issue.field === 'string' ? issue.field.replace(/\[\d+\]$/, '') : 'body';
    const field = (['to', 'subject', 'body', 'threadId'] as const).find((f) => f === name) ?? 'body';
    return { field, message: typeof issue.message === 'string' ? issue.message : 'Invalid value' };
  });
}

/** True when there is nothing to save: no draft is ever created from this (§3 Empty state). */
export function isBlank(fields: ComposeFields): boolean {
  return fields.to.length === 0 && fields.subject.trim() === '' && fields.body.trim() === '' && !fields.threadId;
}

export function replySubject(subject: string | null): string {
  const base = subject ?? '';
  return /^re:/i.test(base.trim()) ? base : `Re: ${base}`;
}

/** Reply mode prefill (DESIGN_SPEC.md §3 Reply mode). */
export function replyFields(message: MessageDTO): ComposeFields {
  const when = message.dateHeader ?? new Date(message.internalDate).toUTCString();
  const quoted = (message.bodyPlain ?? message.snippet)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  return {
    to: [message.fromAddress],
    subject: replySubject(message.subject),
    body: `\n\nOn ${when}, ${message.fromAddress} wrote:\n${quoted}`,
    threadId: message.threadId,
  };
}

/** Splits typed recipient text on commas, semicolons and newlines. */
export function splitRecipients(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
