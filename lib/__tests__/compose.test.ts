import { describe, expect, it } from 'vitest';
import {
  isBlank,
  isValidAddress,
  issuesFromDetails,
  replyFields,
  replySubject,
  splitRecipients,
  validateForSend,
} from '@/lib/compose';
import { message } from '@/lib/__tests__/fixtures';

describe('compose rules (DESIGN_SPEC.md §3)', () => {
  it('prefixes Re: once, case-insensitively', () => {
    expect(replySubject('Hello')).toBe('Re: Hello');
    expect(replySubject('RE: Hello')).toBe('RE: Hello');
    expect(replySubject(null)).toBe('Re: ');
  });

  it('prefills reply mode from the replied message', () => {
    const fields = replyFields(message({ gmailId: 'm1', threadId: 'T1', subject: 'Plans' }));
    expect(fields).toMatchObject({ to: ['Ada Lovelace <ada@example.com>'], subject: 'Re: Plans', threadId: 'T1' });
    expect(fields.body).toBe(
      '\n\nOn Sat, 10 Oct 2026 10:00:00 +0000, Ada Lovelace <ada@example.com> wrote:\n> Line one\n> Line two',
    );
  });

  it('quotes the snippet when bodyPlain is null', () => {
    expect(replyFields(message({ gmailId: 'm1', bodyPlain: null, snippet: 'short' })).body).toContain('> short');
  });

  it('validates like the engine', () => {
    expect(isValidAddress('Ada <ada@example.com>')).toBe(true);
    expect(isValidAddress('ada@example')).toBe(false);
    expect(validateForSend({ to: [], subject: '', body: '' })[0]?.field).toBe('to');
    expect(validateForSend({ to: ['a@b.co'], subject: 'x\ny', body: '' })[0]?.field).toBe('subject');
    expect(validateForSend({ to: ['a@b.co'], subject: 'ok', body: '' })).toEqual([]);
  });

  it('maps server issues onto fields', () => {
    expect(
      issuesFromDetails({
        issues: [
          { field: 'to[1]', message: 'bad' },
          { field: 'threadId', message: 'x' },
        ],
      }),
    ).toEqual([
      { field: 'to', message: 'bad' },
      { field: 'threadId', message: 'x' },
    ]);
  });

  it('treats an untouched drawer as blank, but not a reply', () => {
    expect(isBlank({ to: [], subject: ' ', body: '\n' })).toBe(true);
    expect(isBlank({ to: [], subject: '', body: '', threadId: 'T1' })).toBe(false);
  });

  it('splits typed recipients', () => {
    expect(splitRecipients('a@b.co, c@d.co;\n e@f.co ')).toEqual(['a@b.co', 'c@d.co', 'e@f.co']);
  });
});
