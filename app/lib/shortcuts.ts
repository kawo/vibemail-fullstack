/**
 * The search shortcut (DESIGN_SPEC.md §5): ⌘K on Apple devices, Ctrl+K elsewhere, with no other
 * modifier. It focuses the search field from anywhere except the compose drawer.
 */

export interface ShortcutKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function isSearchShortcut(e: ShortcutKey, mac: boolean): boolean {
  if (e.key.toLowerCase() !== 'k' || e.altKey || e.shiftKey) {
    return false;
  }
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

export function searchShortcutHint(mac: boolean): string {
  return mac ? '⌘K' : 'Ctrl K';
}

/** Apple devices use ⌘; iPadOS reports a Mac platform or names itself in the user agent. */
export function isMacPlatform(nav: { platform: string; userAgent: string }): boolean {
  return /Mac|iPhone|iPad|iPod/.test(nav.platform) || /iPhone|iPad|iPod|Mac OS X/.test(nav.userAgent);
}

/** One line of the shortcuts list: what it does, and each key combination that does it. */
export interface ShortcutItem {
  action: string;
  /** Alternatives; each is one combination, pressed together (`['Shift', 'Space']`). */
  keys: string[][];
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

/**
 * Every keyboard shortcut the app supports, grouped by where it works, for the list opened from
 * Settings (DESIGN_SPEC.md §1 Account and Settings). `mac` picks ⌘ or Ctrl.
 */
export function shortcutGroups(mac: boolean): ShortcutGroup[] {
  const mod = mac ? '⌘' : 'Ctrl';
  return [
    {
      title: 'Anywhere',
      items: [
        { action: 'Search mail', keys: [[mod, 'K']] },
        { action: 'Move between controls', keys: [['Tab'], ['Shift', 'Tab']] },
        { action: 'Close a panel, menu or the compose drawer', keys: [['Esc']] },
      ],
    },
    {
      title: 'Message list',
      items: [
        { action: 'Open the focused message', keys: [['Enter']] },
        { action: 'Select the focused message', keys: [['Space']] },
        { action: 'Select a range', keys: [['Shift', 'Space'], ['Shift', 'Click']] },
        { action: 'Add to the selection', keys: [[mod, 'Click']] },
        { action: 'Clear the selection', keys: [['Esc']] },
        { action: 'Clear the search (in the search field)', keys: [['Esc']] },
      ],
    },
    {
      title: 'Conversation',
      items: [{ action: 'Expand or collapse a message', keys: [['Enter'], ['Space']] }],
    },
    {
      title: 'Compose',
      items: [
        { action: 'Send', keys: [[mod, 'Enter']] },
        { action: 'Add the typed recipient', keys: [['Enter'], [','], [';']] },
        { action: 'Remove the last recipient', keys: [['Backspace']] },
      ],
    },
    {
      title: 'Sidebar',
      items: [
        { action: 'Resize (with the edge focused)', keys: [['←'], ['→']] },
        { action: 'Resize in bigger steps', keys: [['Shift', '←'], ['Shift', '→']] },
        { action: 'Narrowest or widest', keys: [['Home'], ['End']] },
        { action: 'Reset the width', keys: [['Enter']] },
      ],
    },
  ];
}
