/**
 * Line icons for the actions JetBrains Mono has no glyph for (it has nothing that reads as
 * archive or trash). Drawn on a 16px grid with a 1.5px stroke in `currentColor`, square caps, so
 * they sit with the monospaced text glyphs (★, ›, x) at the same size and weight. Decorative:
 * every icon appears next to its word, or inside a control that carries an `aria-label`.
 */
const PATHS = {
  // A tray with a notch: everything in the inbox.
  inbox: 'M2.75 9.25h3l1 1.75h2.5l1-1.75h3 M2.75 9.25 4.5 3.25h7l1.75 6v3.5H2.75z',
  // A box with a lid and a handle slot.
  archive: 'M2.25 3.25h11.5v3H2.25z M3.25 6.25v6.5h9.5v-6.5 M6.25 8.75h3.5',
  // A bin: lid, handle, tapered body with two ribs.
  trash: 'M2.5 4.25h11 M6 4.25v-1.5h4v1.5 M4 4.25l.75 9h6.5l.75-9 M6.75 6.75v4 M9.25 6.75v4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
