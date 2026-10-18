import type { OutgoingAttachment, OutgoingMessage } from '../provider';

/**
 * RFC 2822 message builder for Gmail `messages.send` (CONTRACT.md §4.3). Pure: no I/O.
 * Non-ASCII header text is RFC 2047-encoded; bodies are UTF-8, base64 content-transfer-encoded.
 */

const CRLF = '\r\n';
const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;
/** Max raw bytes per RFC 2047 encoded word, keeping each word within 75 characters. */
const ENCODED_WORD_BYTES = 45;

/** RFC 2047 `=?UTF-8?B?...?=` encoding, split into words on character boundaries. */
export function encodeHeaderText(text: string): string {
  if (ASCII_PRINTABLE.test(text)) {
    return text;
  }
  const words: string[] = [];
  let chunk = '';
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > ENCODED_WORD_BYTES) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) {
    words.push(chunk);
  }
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join(`${CRLF} `);
}

/** Encodes the display name of `Name <addr>` when it is not ASCII; bare addresses pass through. */
export function encodeAddress(address: string): string {
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(address.trim());
  if (!match) {
    return address.trim();
  }
  const [, rawName = '', addr = ''] = match;
  const name = rawName.replace(/^"(.*)"$/, '$1');
  if (!name) {
    return `<${addr}>`;
  }
  return ASCII_PRINTABLE.test(name) ? `${rawName} <${addr}>` : `${encodeHeaderText(name)} <${addr}>`;
}

function base64Body(text: string): string {
  return (Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g) ?? ['']).join(CRLF);
}

/** A fresh MIME boundary. */
function boundary(): string {
  return `vibemail-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * The message content after the top-level headers: its own Content-* headers, a blank line and
 * the body, ending in an empty line. Plain text, HTML, or both as multipart/alternative.
 */
function contentLines(message: OutgoingMessage): string[] {
  const text = message.text ?? (message.html === undefined ? '' : undefined);
  if (text !== undefined && message.html !== undefined) {
    const b = boundary();
    return [
      `Content-Type: multipart/alternative; boundary="${b}"`,
      '',
      `--${b}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Body(text),
      `--${b}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Body(message.html),
      `--${b}--`,
      '',
    ];
  }
  const html = text === undefined ? (message.html ?? '') : undefined;
  return [
    `Content-Type: ${html === undefined ? 'text/plain' : 'text/html'}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(html ?? text ?? ''),
    '',
  ];
}

/**
 * A Content-Type / Content-Disposition file-name parameter: a quoted string when the name is
 * printable ASCII, else RFC 2231 `name*=UTF-8''<percent-encoded>`. Control characters are dropped.
 */
export function fileParam(param: 'name' | 'filename', filename: string): string {
  const clean = filename.replace(/[\u0000-\u001f\u007f]/g, '');
  if (ASCII_PRINTABLE.test(clean)) {
    return `${param}="${clean.replace(/[\\"]/g, '\\$&')}"`;
  }
  const encoded = encodeURIComponent(clean).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${param}*=UTF-8''${encoded}`;
}

function attachmentLines(attachment: OutgoingAttachment): string[] {
  return [
    `Content-Type: ${attachment.mimeType}; ${fileParam('name', attachment.filename)}`,
    `Content-Disposition: attachment; ${fileParam('filename', attachment.filename)}`,
    'Content-Transfer-Encoding: base64',
    '',
    (attachment.content.toString('base64').match(/.{1,76}/g) ?? ['']).join(CRLF),
  ];
}

/** Builds the RFC 2822 message. Callers validate addresses and reject CR/LF in headers first. */
export function buildRfc2822(message: OutgoingMessage, date: Date = new Date()): string {
  const headers = [
    `From: ${encodeAddress(message.from)}`,
    // A draft may have no recipients yet (CONTRACT.md §4.10): omit the header rather than send it empty.
    ...(message.to.length > 0 ? [`To: ${message.to.map(encodeAddress).join(', ')}`] : []),
    ...(message.cc && message.cc.length > 0 ? [`Cc: ${message.cc.map(encodeAddress).join(', ')}`] : []),
    ...(message.bcc && message.bcc.length > 0 ? [`Bcc: ${message.bcc.map(encodeAddress).join(', ')}`] : []),
    `Subject: ${encodeHeaderText(message.subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    ...(message.inReplyTo ? [`In-Reply-To: ${message.inReplyTo}`] : []),
    ...(message.references ? [`References: ${message.references}`] : []),
    'MIME-Version: 1.0',
  ];
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) {
    return [...headers, ...contentLines(message)].join(CRLF);
  }
  // v1.3 (CONTRACT.md §4.3): the body first, then one part per file, in order.
  const b = boundary();
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    ...contentLines(message),
    ...attachments.flatMap((attachment) => [`--${b}`, ...attachmentLines(attachment)]),
    `--${b}--`,
    '',
  ].join(CRLF);
}

/** The `raw` field for `messages.send`: the whole message, base64url-encoded. */
export function toRaw(rfc2822: string): string {
  return Buffer.from(rfc2822, 'utf8').toString('base64url');
}
