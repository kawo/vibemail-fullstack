import { buildRfc2822, encodeAddress, encodeHeaderText, toRaw } from '../../src/providers/gmail/mime';

const date = new Date('2026-10-06T10:00:00.000Z');

function parse(mime: string) {
  const [head = '', ...rest] = mime.split('\r\n\r\n');
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r\n /g, ' ').split('\r\n')) {
    const i = line.indexOf(':');
    headers.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim());
  }
  return { headers, body: rest.join('\r\n\r\n') };
}

describe('buildRfc2822 (CONTRACT.md §4.3)', () => {
  it('builds a plain-text UTF-8 message with CRLF line endings', () => {
    const mime = buildRfc2822(
      { from: 'me@example.com', to: ['a@x.io', 'Bob <b@x.io>'], subject: 'Hello', text: 'Hi there ü' },
      date,
    );
    expect(mime).not.toMatch(/[^\r]\n/);
    const { headers, body } = parse(mime);
    expect(headers.get('from')).toBe('me@example.com');
    expect(headers.get('to')).toBe('a@x.io, Bob <b@x.io>');
    expect(headers.get('subject')).toBe('Hello');
    expect(headers.get('date')).toBe('Tue, 06 Oct 2026 10:00:00 +0000');
    expect(headers.get('mime-version')).toBe('1.0');
    expect(headers.get('content-type')).toBe('text/plain; charset=UTF-8');
    expect(headers.get('content-transfer-encoding')).toBe('base64');
    expect(headers.has('in-reply-to')).toBe(false);
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe('Hi there ü');
  });

  it('RFC 2047-encodes a non-ASCII subject and display name', () => {
    const mime = buildRfc2822({ from: 'me@example.com', to: ['Jürgen <j@x.io>'], subject: 'Grüße 👋', text: '' }, date);
    const { headers } = parse(mime);
    expect(headers.get('subject')).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
    expect(headers.get('to')).toMatch(/^=\?UTF-8\?B\?.+\?= <j@x\.io>$/);
  });

  it('splits long encoded subjects into words of at most 75 characters', () => {
    const encoded = encodeHeaderText('é'.repeat(100));
    const words = encoded.split('\r\n ');
    expect(words.length).toBeGreaterThan(1);
    for (const word of words) {
      expect(word.length).toBeLessThanOrEqual(75);
    }
    const decoded = words.map((w) => Buffer.from(w.slice(10, -2), 'base64').toString('utf8')).join('');
    expect(decoded).toBe('é'.repeat(100));
  });

  it('wraps base64 body lines at 76 characters', () => {
    const { body } = parse(buildRfc2822({ from: 'a@x.io', to: ['b@x.io'], subject: 's', text: 'x'.repeat(500) }, date));
    for (const line of body.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  it('produces multipart/alternative when both text and html are given', () => {
    const mime = buildRfc2822({ from: 'a@x.io', to: ['b@x.io'], subject: 's', text: 't', html: '<b>h</b>' }, date);
    expect(parse(mime).headers.get('content-type')).toMatch(/^multipart\/alternative; boundary="/);
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
  });

  it('leaves ASCII names and bare addresses unchanged', () => {
    expect(encodeAddress(' plain@x.io ')).toBe('plain@x.io');
    expect(encodeAddress('"Doe, Jane" <jane@x.io>')).toBe('"Doe, Jane" <jane@x.io>');
  });

  it('base64url-encodes the raw message', () => {
    const raw = toRaw('Subject: ??>\r\n\r\nbody');
    expect(raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toBe('Subject: ??>\r\n\r\nbody');
  });
});

describe('buildRfc2822 without recipients (CONTRACT.md §4.10)', () => {
  it('omits the To header for a draft with no recipients', () => {
    const mime = buildRfc2822({ from: 'me@example.com', to: [], subject: 's', text: 't' }, date);
    expect(mime).not.toMatch(/^To:/m);
    expect(mime).toContain('From: me@example.com\r\n');
  });
});

describe('buildRfc2822 with attachments (CONTRACT.md §4.3, v1.3)', () => {
  const pdf = Buffer.from(Array.from({ length: 200 }, (_, i) => i % 256));
  const base = { from: 'me@example.com', to: ['a@x.io'], subject: 'Files', text: 'See attached' };

  /** The parts of a multipart body, by its boundary parameter. */
  function parts(mime: string) {
    const { headers, body } = parse(mime);
    const boundary = /boundary="([^"]+)"/.exec(headers.get('content-type') ?? '')?.[1] ?? '';
    const chunks = body.split(`--${boundary}`);
    expect(chunks[chunks.length - 1]?.startsWith('--')).toBe(true); // closing delimiter
    return { headers, parts: chunks.slice(1, -1).map((c) => parse(c.replace(/^\r\n/, ''))) };
  }

  it('wraps the body and each attachment in multipart/mixed', () => {
    const mime = buildRfc2822({ ...base, attachments: [{ filename: 'report.pdf', mimeType: 'application/pdf', content: pdf }] }, date);
    expect(mime).not.toMatch(/[^\r]\n/);
    const { headers, parts: [text, file] } = parts(mime);
    expect(headers.get('content-type')).toMatch(/^multipart\/mixed; boundary="[^"]+"$/);
    expect(text?.headers.get('content-type')).toBe('text/plain; charset=UTF-8');
    expect(Buffer.from(text?.body ?? '', 'base64').toString('utf8')).toBe('See attached');
    expect(file?.headers.get('content-type')).toBe('application/pdf; name="report.pdf"');
    expect(file?.headers.get('content-disposition')).toBe('attachment; filename="report.pdf"');
    expect(file?.headers.get('content-transfer-encoding')).toBe('base64');
    const lines = (file?.body ?? '').trimEnd().split('\r\n');
    expect(lines.every((l) => l.length <= 76)).toBe(true);
    expect(Buffer.from(lines.join(''), 'base64').equals(pdf)).toBe(true);
  });

  it('keeps multipart/alternative as the first part when there is html too', () => {
    const mime = buildRfc2822(
      { ...base, html: '<p>See attached</p>', attachments: [{ filename: 'a.txt', mimeType: 'text/plain', content: Buffer.from('a') }] },
      date,
    );
    const { parts: [body, file] } = parts(mime);
    expect(body?.headers.get('content-type')).toMatch(/^multipart\/alternative; boundary="[^"]+"$/);
    expect(file?.headers.get('content-disposition')).toBe('attachment; filename="a.txt"');
  });

  it('keeps the attachments in order', () => {
    const files = ['one.txt', 'two.txt', 'three.txt'].map((filename) => ({ filename, mimeType: 'text/plain', content: Buffer.from(filename) }));
    const { parts: [, ...attached] } = parts(buildRfc2822({ ...base, attachments: files }, date));
    expect(attached.map((p) => p.headers.get('content-disposition'))).toEqual([
      'attachment; filename="one.txt"',
      'attachment; filename="two.txt"',
      'attachment; filename="three.txt"',
    ]);
  });

  it('encodes a non-ASCII filename with RFC 2231', () => {
    const { parts: [, file] } = parts(
      buildRfc2822({ ...base, attachments: [{ filename: 'résumé.pdf', mimeType: 'application/pdf', content: pdf }] }, date),
    );
    expect(file?.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
    expect(file?.headers.get('content-type')).toBe("application/pdf; name*=UTF-8''r%C3%A9sum%C3%A9.pdf");
  });

  it('escapes quotes and backslashes in an ASCII filename', () => {
    const { parts: [, file] } = parts(
      buildRfc2822({ ...base, attachments: [{ filename: 'say "hi" \\ now.txt', mimeType: 'text/plain', content: Buffer.from('x') }] }, date),
    );
    expect(file?.headers.get('content-disposition')).toBe('attachment; filename="say \\"hi\\" \\\\ now.txt"');
  });

  it('leaves a message without attachments exactly as before', () => {
    const plain = { from: 'me@example.com', to: ['a@x.io'], subject: 'Hello', text: 'Hi' };
    expect(buildRfc2822({ ...plain, attachments: [] }, date)).toBe(buildRfc2822(plain, date));
  });
});
