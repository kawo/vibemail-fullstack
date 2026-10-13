import { describe, expect, it } from 'vitest';
import { messages as sampleMessages } from '@/data/data';
import { ApiError } from '../errors';
import { createSampleSource, deriveStatus, labelIssues } from '../sampleSource';

const source = () => createSampleSource({ state: 'normal', latencyMs: 0 });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof ApiError ? error.code : 'not an ApiError';
  }
}

describe('sample source: CONTRACT.md as the engine would serve it', () => {
  it('derives status by the §3.4 rule, first match wins', () => {
    expect(deriveStatus(['INBOX', 'TRASH'])).toBe('trash');
    expect(deriveStatus(['SPAM', 'INBOX'])).toBe('spam');
    expect(deriveStatus(['INBOX', 'SENT'])).toBe('inbox');
    expect(deriveStatus(['SENT'])).toBe('sent');
    expect(deriveStatus(['Label_7'])).toBe('archived');
  });

  it('keeps data.js consistent with its own labels', () => {
    for (const m of sampleMessages) {
      expect(m.status).toBe(deriveStatus(m.labelIds));
      expect(m.isRead).toBe(!m.labelIds.includes('UNREAD'));
      expect(m.isStarred).toBe(m.labelIds.includes('STARRED'));
    }
  });

  it('lists newest first and never writes to data.js', async () => {
    const s = source();
    const { messages } = await s.listMessages();
    const dates = messages.map((m) => m.internalDate);
    expect(dates).toEqual([...dates].sort().reverse());
    const first = messages[0];
    if (!first) throw new Error('no messages');
    await s.updateLabels(first.gmailId, { addLabelIds: ['STARRED'] });
    expect(sampleMessages.find((m) => m.gmailId === first.gmailId)?.labelIds.includes('STARRED')).toBe(first.isStarred);
  });

  it('applies label changes and re-derives status, read and star (§4.7)', async () => {
    const s = source();
    const archived = await s.updateLabels('m1', { removeLabelIds: ['INBOX'] });
    expect(archived.message.status).toBe('archived');
    const unread = await s.updateLabels('m4', { addLabelIds: ['UNREAD'] });
    expect(unread.message.isRead).toBe(false);
    const read = await s.markRead('m4');
    expect(read.message.isRead).toBe(true);
    expect((await s.markRead('m4')).message.isRead).toBe(true); // idempotent (§2 criterion 7)
  });

  it('trash drops INBOX and untrash restores it, as Gmail does', async () => {
    const s = source();
    const trashed = await s.updateLabels('m6', { addLabelIds: ['TRASH'] });
    expect(trashed.message.status).toBe('trash');
    expect(trashed.message.labelIds).not.toContain('INBOX');
    const restored = await s.updateLabels('m6', { removeLabelIds: ['TRASH'] });
    expect(restored.message.status).toBe('inbox');
  });

  it('rejects label changes the contract rejects', async () => {
    expect(labelIssues({ addLabelIds: ['TRASH', 'STARRED'] })).toContain('TRASH must be the only label');
    expect(labelIssues({ addLabelIds: ['SENT'] })).toContain('DRAFT, SENT, SPAM and CHAT cannot be changed');
    expect(labelIssues({})).toContain('at least one label is required');
    expect(await code(source().updateLabels('m1', { addLabelIds: ['SPAM'] }))).toBe('VALIDATION_FAILED');
    expect(await code(source().updateLabels('nope', { addLabelIds: ['STARRED'] }))).toBe('MESSAGE_NOT_FOUND');
  });

  it('serves threads oldest first, and 404s an unknown one (§4.8)', async () => {
    const thread = await source().getThread('contract');
    expect(thread.messages.length).toBe(3);
    expect(thread.messages[0]?.subject).toBe('Contract redlines');
    expect(await code(source().getThread('missing'))).toBe('MESSAGE_NOT_FOUND');
  });

  it('searches every term across subject, people, snippet and body (§4.9)', async () => {
    const { messages } = await source().search('thursday retro');
    expect(messages.map((m) => m.subject)).toContain('Offsite agenda, v3');
    expect(await code(source().search('a'))).toBe('VALIDATION_FAILED');
  });

  it('pages with an opaque cursor and rejects a bad one', async () => {
    const s = source();
    const first = await s.listMessages(undefined, 4);
    expect(first.messages.length).toBe(4);
    expect(first.nextCursor).not.toBeNull();
    const second = await s.listMessages(first.nextCursor ?? undefined, 4);
    expect(second.messages[0]?.gmailId).not.toBe(first.messages[0]?.gmailId);
    expect(await code(s.listMessages('garbage'))).toBe('VALIDATION_FAILED');
  });

  it('creates, replaces, lists and deletes drafts (§4.10–§4.13)', async () => {
    const s = source();
    const { draft } = await s.createDraft({ to: ['a@b.example'], subject: 'Hi', body: 'x' });
    const updated = await s.updateDraft(draft.draftId, { to: [], subject: 'Hi again', body: '' });
    expect(updated.draft.draftId).toBe(draft.draftId);
    expect(updated.draft.gmailId).not.toBe(draft.gmailId);
    expect(updated.draft).toMatchObject({ to: [], subject: 'Hi again', body: '' }); // a full replacement
    expect((await s.listDrafts()).drafts[0]?.draftId).toBe(draft.draftId);
    await s.deleteDraft(draft.draftId);
    expect(await code(s.deleteDraft(draft.draftId))).toBe('MESSAGE_NOT_FOUND');
  });

  it('sends into a known thread and lists the sent message (§4.3)', async () => {
    const s = source();
    const { message } = await s.send({ to: ['Marcus Hale <marcus@northwind.example>'], subject: 'Re: Contract redlines', body: 'Done.', threadId: 'contract' });
    expect(message.status).toBe('sent');
    expect((await s.listMessages()).messages[0]?.gmailId).toBe(message.gmailId);
    expect(await code(s.send({ to: ['a@b.example'], subject: 'x', body: 'y', threadId: 'nope' }))).toBe('MESSAGE_NOT_FOUND');
  });

  it('reaches the DESIGN_SPEC error and empty states through its state hooks', async () => {
    expect(await code(createSampleSource({ state: 'error', latencyMs: 0 }).listMessages())).toBe('INTERNAL');
    expect(await code(createSampleSource({ state: 'reconnect', latencyMs: 0 }).listMessages())).toBe('GMAIL_NOT_CONNECTED');
    expect(await code(createSampleSource({ state: 'ratelimit', latencyMs: 0 }).updateLabels('m1', { addLabelIds: ['STARRED'] }))).toBe('GMAIL_RATE_LIMITED');
    const syncing = await createSampleSource({ state: 'syncing', latencyMs: 0 }).listMessages();
    expect(syncing).toMatchObject({ messages: [], lastSyncedAt: null });
  });
});
