/**
 * The sidebar's width when it is shown beside the content (768px and wider). People drag its
 * edge, or focus the edge and use the arrow keys; double-click or Enter puts it back. The width is
 * remembered on this device only (localStorage), and anything unreadable falls back to the default.
 */

export const SIDEBAR_DEFAULT = 232;
export const SIDEBAR_MIN = 184;
export const SIDEBAR_MAX = 360;
const STEP = 8;
const BIG_STEP = 32;
const STORAGE_KEY = 'vibemail.sidebarWidth';

export function clampSidebar(width: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_DEFAULT;
  }
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
}

/** The width after a key press on the resize handle, or null when the key does nothing. */
export function widthForKey(current: number, key: string, shift: boolean): number | null {
  const step = shift ? BIG_STEP : STEP;
  switch (key) {
    case 'ArrowRight':
      return clampSidebar(current + step);
    case 'ArrowLeft':
      return clampSidebar(current - step);
    case 'Home':
      return SIDEBAR_MIN;
    case 'End':
      return SIDEBAR_MAX;
    case 'Enter':
      return SIDEBAR_DEFAULT;
    default:
      return null;
  }
}

export function loadSidebarWidth(storage: Pick<Storage, 'getItem'> | null = safeStorage()): number {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw === null || raw === undefined ? SIDEBAR_DEFAULT : clampSidebar(Number(raw));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export function saveSidebarWidth(width: number, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, String(clampSidebar(width)));
  } catch {
    // Storage can be blocked (private mode, sandboxed frames); the width just isn't remembered.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
