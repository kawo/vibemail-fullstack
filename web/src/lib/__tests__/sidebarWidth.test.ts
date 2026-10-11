import { describe, expect, it } from 'vitest';
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, clampSidebar, loadSidebarWidth, saveSidebarWidth, widthForKey } from '../sidebarWidth';

describe('resizable sidebar', () => {
  it('keeps the width between the minimum and maximum', () => {
    expect(clampSidebar(100)).toBe(SIDEBAR_MIN);
    expect(clampSidebar(1000)).toBe(SIDEBAR_MAX);
    expect(clampSidebar(250.6)).toBe(251);
    expect(clampSidebar(Number.NaN)).toBe(SIDEBAR_DEFAULT);
  });

  it('moves by 8px per arrow, 32px with Shift, and jumps with Home, End and Enter', () => {
    expect(widthForKey(232, 'ArrowRight', false)).toBe(240);
    expect(widthForKey(232, 'ArrowLeft', true)).toBe(200);
    expect(widthForKey(SIDEBAR_MIN, 'ArrowLeft', false)).toBe(SIDEBAR_MIN);
    expect(widthForKey(300, 'Home', false)).toBe(SIDEBAR_MIN);
    expect(widthForKey(200, 'End', false)).toBe(SIDEBAR_MAX);
    expect(widthForKey(300, 'Enter', false)).toBe(SIDEBAR_DEFAULT);
    expect(widthForKey(300, 'a', false)).toBeNull();
  });

  it('remembers a width and ignores anything unreadable', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(loadSidebarWidth(storage)).toBe(SIDEBAR_DEFAULT);
    saveSidebarWidth(300, storage);
    expect(loadSidebarWidth(storage)).toBe(300);
    saveSidebarWidth(9999, storage);
    expect(loadSidebarWidth(storage)).toBe(SIDEBAR_MAX);
    map.set('vibemail.sidebarWidth', 'wide');
    expect(loadSidebarWidth(storage)).toBe(SIDEBAR_DEFAULT);
  });

  it('copes with storage that throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSidebarWidth(blocked)).toBe(SIDEBAR_DEFAULT);
    expect(() => saveSidebarWidth(300, blocked)).not.toThrow();
  });
});
