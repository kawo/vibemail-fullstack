/** Display helpers. Raw `fromAddress` values look like `Ada <ada@x.io>` or `ada@x.io`. */

export function displayName(address: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/.exec(address);
  if (match) {
    return match[1]?.trim() || match[2]?.trim() || address;
  }
  return address.trim();
}

/** The bare address of `Name <addr>`, or the raw value when it has no angle brackets. */
export function emailAddress(address: string): string {
  const match = /<([^<>]+)>\s*$/.exec(address);
  return (match?.[1] ?? address).trim();
}

/** The address to show in brackets beside a name: none when the name already is the address. */
export function addressBesideName(address: string, name: string): string | null {
  const mail = emailAddress(address);
  return mail && mail.toLowerCase() !== name.trim().toLowerCase() ? mail : null;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days} d ago`;
  }
  return then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits `text` into highlighted and plain segments for the search terms (case-insensitive). */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  const usable = terms.filter((t) => t.length > 0).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (usable.length === 0 || text.length === 0) {
    return [{ text, hit: false }];
  }
  const pattern = new RegExp(`(${usable.join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, hit: usable.some((t) => new RegExp(`^${t}$`, 'i').test(part)) }));
}
