import { describe, expect, it } from 'vitest';
import { joinQuote, replyFields, splitQuote } from '@/lib/compose';
import { message } from '@/lib/__tests__/fixtures';

describe('reply quote (DESIGN_SPEC.md §3 Reply mode)', () => {
  const reply = replyFields(message({ gmailId: 'm1', threadId: 'T1', subject: 'Morning standup notes', bodyPlain: 'Ship it\nThanks' }));

  it('splits a fresh reply into an empty text and the quote', () => {
    const { text, quote } = splitQuote(reply.body);
    expect(text).toBe('');
    expect(quote).toBe('On Sat, 10 Oct 2026 10:00:00 +0000, Ada Lovelace <ada@example.com> wrote:\n> Ship it\n> Thanks');
  });

  it('joins back to exactly the reply-mode body', () => {
    const { text, quote } = splitQuote(reply.body);
    expect(joinQuote(text, quote)).toBe(reply.body);
  });

  it('keeps what the user typed above the quote', () => {
    const typed = joinQuote('Sounds good.\nSee you there.', splitQuote(reply.body).quote);
    expect(splitQuote(typed)).toEqual({ text: 'Sounds good.\nSee you there.', quote: splitQuote(reply.body).quote });
  });

  it('leaves a body without a trailing quote whole', () => {
    expect(splitQuote('Hi\n> not a quote block\nbye')).toEqual({ text: 'Hi\n> not a quote block\nbye', quote: null });
    expect(splitQuote('On Monday we ship.')).toEqual({ text: 'On Monday we ship.', quote: null });
    expect(joinQuote('Hi', null)).toBe('Hi');
  });

  it('uses the last attribution when the quote itself quotes', () => {
    const body = 'Reply\n\nOn Tue, B wrote:\n> yes\n> On Mon, A wrote:\n> > first';
    expect(splitQuote(body).quote).toBe('On Tue, B wrote:\n> yes\n> On Mon, A wrote:\n> > first');
  });
});
