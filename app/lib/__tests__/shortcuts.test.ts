import { describe, expect, it } from 'vitest';
import { isMacPlatform, isSearchShortcut, searchShortcutHint, shortcutGroups } from '@/app/lib/shortcuts';

const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('search shortcut (DESIGN_SPEC.md §5)', () => {
  it('is ⌘K on a Mac', () => {
    expect(isSearchShortcut(key('k', { metaKey: true }), true)).toBe(true);
    expect(isSearchShortcut(key('K', { metaKey: true }), true)).toBe(true);
    expect(isSearchShortcut(key('k', { ctrlKey: true }), true)).toBe(false);
  });

  it('is Ctrl+K elsewhere', () => {
    expect(isSearchShortcut(key('k', { ctrlKey: true }), false)).toBe(true);
    expect(isSearchShortcut(key('k', { metaKey: true }), false)).toBe(false);
  });

  it('ignores K alone and K with other modifiers', () => {
    expect(isSearchShortcut(key('k'), false)).toBe(false);
    expect(isSearchShortcut(key('k', { ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key('k', { ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(isSearchShortcut(key('j', { ctrlKey: true }), false)).toBe(false);
  });

  it('shows the hint for the device', () => {
    expect(searchShortcutHint(true)).toBe('⌘K');
    expect(searchShortcutHint(false)).toBe('Ctrl K');
  });

  it('detects Apple platforms', () => {
    expect(isMacPlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMacPlatform({ platform: 'iPhone', userAgent: '' })).toBe(true);
    expect(isMacPlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe(false);
    expect(isMacPlatform({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
  });
});

describe('keyboard shortcuts list (DESIGN_SPEC.md §1 Account and Settings)', () => {
  const find = (mac: boolean, action: string) =>
    shortcutGroups(mac)
      .flatMap((g) => g.items)
      .find((i) => i.action === action);

  it('groups the shortcuts by where they work, in order', () => {
    expect(shortcutGroups(false).map((g) => g.title)).toEqual(['Anywhere', 'Message list', 'Conversation', 'Compose', 'Sidebar']);
  });

  it('uses ⌘ on Apple devices and Ctrl elsewhere', () => {
    expect(find(true, 'Search mail')?.keys).toEqual([['⌘', 'K']]);
    expect(find(false, 'Search mail')?.keys).toEqual([['Ctrl', 'K']]);
    expect(find(true, 'Send')?.keys).toEqual([['⌘', 'Enter']]);
    expect(find(false, 'Send')?.keys).toEqual([['Ctrl', 'Enter']]);
  });

  it('lists every action once', () => {
    const actions = shortcutGroups(false).flatMap((g) => g.items.map((i) => `${g.title}: ${i.action}`));
    expect(new Set(actions).size).toBe(actions.length);
  });
});
