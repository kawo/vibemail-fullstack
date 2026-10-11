import { describe, expect, it } from 'vitest';
import { initials, isThreadStarred, isThreadUnread, starTargets, threadSubject, unreadTargets } from '../thread';
import { message } from './fixtures';

describe('thread view helpers (DESIGN_SPEC.md §2)', () => {
  const oldest = message({ gmailId: 'a', subject: 'Contract redlines', internalDate: '2026-10-08T10:00:00.000Z' });
  const middle = message({ gmailId: 'b', subject: 'Re: Contract redlines', internalDate: '2026-10-09T10:00:00.000Z' });
  const newest = message({ gmailId: 'c', subject: 'Re: Contract redlines', internalDate: '2026-10-10T10:00:00.000Z' });

  it('makes avatar initials from the display name or the address', () => {
    expect(initials('Marcus Hale <marcus@northwind.example>')).toBe('MH');
    expect(initials('"Ana Maria Silva" <ana@x.io>')).toBe('AM');
    expect(initials('build-bot <ci@northwind.example>')).toBe('BB');
    expect(initials('ci@northwind.example')).toBe('C');
    expect(initials('Élodie <e@x.io>')).toBe('É');
    expect(initials('<>')).toBe('?');
  });

  it('takes the heading from the oldest message', () => {
    expect(threadSubject([oldest, middle, newest])).toBe('Contract redlines');
    expect(threadSubject([message({ gmailId: 'x', subject: null })])).toBe('(no subject)');
    expect(threadSubject([])).toBe('(no subject)');
  });

  it('stars the newest message when nothing is starred', () => {
    const thread = [oldest, middle, newest];
    expect(isThreadStarred(thread)).toBe(false);
    expect(starTargets(thread)).toEqual({ star: true, targets: [newest] });
  });

  it('unstars every starred message when any is starred', () => {
    const a = { ...oldest, isStarred: true };
    const c = { ...newest, isStarred: true };
    const thread = [a, middle, c];
    expect(isThreadStarred(thread)).toBe(true);
    expect(starTargets(thread)).toEqual({ star: false, targets: [a, c] });
  });

  it('marks the newest message unread when everything is read', () => {
    const thread = [oldest, middle, newest];
    expect(isThreadUnread(thread)).toBe(false);
    expect(unreadTargets(thread)).toEqual({ unread: true, targets: [newest] });
  });

  it('marks every unread message read when any is unread', () => {
    const b = { ...middle, isRead: false };
    const thread = [oldest, b, newest];
    expect(isThreadUnread(thread)).toBe(true);
    expect(unreadTargets(thread)).toEqual({ unread: false, targets: [b] });
  });
});
