import { describe, expect, it } from 'vitest';
import { addressBesideName, displayName, emailAddress, formatSize, highlight, relativeTime } from '../format';

describe('format helpers', () => {
  it('takes the bare address, and shows it beside a name only when it adds something', () => {
    expect(emailAddress('Lena Ortiz <lena@northwind.example>')).toBe('lena@northwind.example');
    expect(emailAddress('lena@northwind.example')).toBe('lena@northwind.example');
    expect(addressBesideName('Lena Ortiz <lena@northwind.example>', 'Lena Ortiz')).toBe('lena@northwind.example');
    expect(addressBesideName('lena@northwind.example', 'lena@northwind.example')).toBeNull();
    expect(addressBesideName('<Lena@Northwind.example>', 'lena@northwind.example')).toBeNull();
  });

  it('shows the display name of Name <addr>, else the address', () => {
    expect(displayName('Ada Lovelace <ada@example.com>')).toBe('Ada Lovelace');
    expect(displayName('"Ada" <ada@example.com>')).toBe('Ada');
    expect(displayName('<ada@example.com>')).toBe('ada@example.com');
    expect(displayName('ada@example.com')).toBe('ada@example.com');
  });

  it('formats relative times', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(relativeTime('2026-10-10T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-10-10T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-10-10T09:00:00Z', now)).toBe('3 h ago');
  });

  it('formats sizes', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
  });

  it('highlights every term, case-insensitively, escaping regex characters', () => {
    expect(highlight('Quarterly Report (Q3)', ['report', '(q3)'])).toEqual([
      { text: 'Quarterly ', hit: false },
      { text: 'Report', hit: true },
      { text: ' ', hit: false },
      { text: '(Q3)', hit: true },
    ]);
  });
});
