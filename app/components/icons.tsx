/**
 * VibeMail's drawn icons, for the symbols JetBrains Mono can't draw: nothing in the font reads as
 * archive, trash, inbox, draft or attachment, and the Google Fonts subsets the app loads lack ★ ☆ ↻ ≡ ● ○,
 * so browsers would draw those from whatever system font they have.
 *
 * One set of rules, so they sit with the monospaced text: a 16px grid, a 1.5px stroke in
 * `currentColor`, square caps and mitred joins; a "filled" icon fills the same outline. They are
 * decorative: every icon is next to its word or inside a control with an `aria-label`. The same
 * shapes ship as SVG files in the VibeMail Glass design system (assets/Icons).
 */
const ICONS = {
  // A tray with a notch: everything in the inbox.
  inbox: { d: 'M2.75 9.25h3l1 1.75h2.5l1-1.75h3 M2.75 9.25 4.5 3.25h7l1.75 6v3.5H2.75z' },
  // A box with a lid and a handle slot.
  archive: { d: 'M2.25 3.25h11.5v3H2.25z M3.25 6.25v6.5h9.5v-6.5 M6.25 8.75h3.5' },
  // A bin: lid, handle, tapered body with two ribs.
  trash: { d: 'M2.5 4.25h11 M6 4.25v-1.5h4v1.5 M4 4.25l.75 9h6.5l.75-9 M6.75 6.75v4 M9.25 6.75v4' },
  // A page with a folded corner and two lines of writing: an unsent draft.
  draft: { d: 'M3.75 1.75h5.75l2.75 2.75v9.75h-8.5z M9.5 1.75v2.75h2.75 M6 8h4 M6 10.75h4' },
  // Five points; filled when starred, outlined when not.
  star: { d: 'M8 2.1 9.62 6.38 14.18 6.59 10.62 9.45 11.82 13.86 8 11.35 4.18 13.86 5.38 9.45 1.82 6.59 6.38 6.38Z', filled: true },
  'star-outline': { d: 'M8 2.1 9.62 6.38 14.18 6.59 10.62 9.45 11.82 13.86 8 11.35 4.18 13.86 5.38 9.45 1.82 6.59 6.38 6.38Z' },
  // A tick and a dash: a selected and a partly selected checkbox.
  check: { d: 'M4 8.25 6.75 11 12 5' },
  'check-mixed': { d: 'M4.5 8h7' },
  // Two sliders, their knobs at different stops: display settings.
  sliders: { d: 'M2.5 4.75h11 M2.5 11.25h11 M6 3v3.5 M10.5 9.5v3.5' },
  // A keyboard: a row of keys over a space bar, for the shortcuts list.
  keyboard: { d: 'M1.75 4.25h12.5v7.5H1.75z M4 6.75h1 M7.5 6.75h1 M11 6.75h1 M5 9.25h6' },
  // A circular arrow, clockwise.
  refresh: { d: 'M13 8a5 5 0 1 1-1.5-3.55 M11.75 1.75v3h-3' },
  // Three bars: opens the sidebar on a phone.
  menu: { d: 'M2.5 4.25h11 M2.5 8h11 M2.5 11.75h11' },
  // A paperclip: the message has attachments.
  paperclip: { d: 'M10.75 6 6.4 10.35a1.4 1.4 0 0 0 1.98 1.98l4.6-4.6a2.9 2.9 0 0 0-4.1-4.1L4.2 8.32a4.3 4.3 0 0 0 6.08 6.08l3.1-3.1' },
  // Unread toggle: a filled dot when unread, a ring when read.
  dot: { d: 'M8 4.75a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 1 1 0-6.5Z', filled: true },
  ring: { d: 'M8 4.75a3.25 3.25 0 1 1 0 6.5a3.25 3.25 0 1 1 0-6.5Z' },
} as const satisfies Record<string, { d: string; filled?: boolean }>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const icon: { d: string; filled?: boolean } = ICONS[name];
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill={icon.filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d={icon.d} />
    </svg>
  );
}
