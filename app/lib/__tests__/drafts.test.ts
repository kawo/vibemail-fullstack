import { describe, expect, it } from 'vitest';
import type { DraftDTO } from '@/app/services/types';
import { appendDrafts, draftRecipients, draftSnippet, removeDraft, replyThreadId, upsertDraft } from '@/app/lib/drafts';

const draft = (draftId: string, patch: Partial<DraftDTO> = {}): DraftDTO => ({
  draftId,
  gmailId: `m-${draftId}`,
  threadId: `t-${draftId}`,
  to: [],
  subject: '',
  body: '',
  updatedAt: '2026-10-11T07:00:00Z',
  ...patch,
});

describe('Drafts list (DESIGN_SPEC.md §4 Drafts)', () => {
  const list = [draft('a'), draft('b'), draft('c')];

  it('moves a saved draft to the top, and adds a new one there', () => {
    expect(upsertDraft(list, draft('b', { subject: 'x' })).map((d) => d.draftId)).toEqual(['b', 'a', 'c']);
    expect(upsertDraft(list, draft('n')).map((d) => d.draftId)).toEqual(['n', 'a', 'b', 'c']);
  });

  it('removes a discarded or sent draft', () => {
    expect(removeDraft(list, 'b').map((d) => d.draftId)).toEqual(['a', 'c']);
  });

  it('appends a further page without repeating a draft already listed', () => {
    expect(appendDrafts(list, [draft('c'), draft('d')]).map((d) => d.draftId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('opens as a reply only for this device’s reply snapshot or a stored thread', () => {
    const none = () => false;
    expect(replyThreadId(draft('a'), { draftId: 'a', requestedThreadId: 't-r' }, none)).toBe('t-r');
    expect(replyThreadId(draft('a'), { draftId: 'a' }, () => true)).toBeUndefined();
    expect(replyThreadId(draft('a'), null, (t) => t === 't-a')).toBe('t-a');
    expect(replyThreadId(draft('a'), { draftId: 'z', requestedThreadId: 't-z' }, none)).toBeUndefined();
  });

  it('shows recipients by name, or a placeholder', () => {
    expect(draftRecipients(draft('a', { to: ['Lena Ortiz <lena@example.com>', 'bo@example.com'] }))).toBe('Lena Ortiz, bo@example.com');
    expect(draftRecipients(draft('a'))).toBe('(no recipients)');
  });

  it('snips the body without the quoted reply', () => {
    const body = 'Sounds good,\nsee you then.\n\nOn Fri, Oct 9, 2026, Lena wrote:\n> Lunch?';
    expect(draftSnippet(draft('a', { body }))).toBe('Sounds good, see you then.');
  });
});
