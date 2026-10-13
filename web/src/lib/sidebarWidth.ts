/**
 * The sidebar's width when it is shown beside the content (768px and wider). People drag its
 * edge, or focus the edge and use the arrow keys; double-click or Enter puts it back. Or they
 * collapse it to icons only (SIDEBAR_COLLAPSED wide). Width and mode are remembered on this
 * device only (localStorage); anything unreadable falls back to the default.
 */

export const SIDEBAR_DEFAULT = 232;
export const SIDEBAR_MIN = 184;
export const SIDEBAR_MAX = 360;
const STEP = 8;
const BIG_STEP = 32;
export const SIDEBAR_COLLAPSED = 56;
const STORAGE_KEY = 'vibemail.sidebarWidth';
const COLLAPSED_KEY = 'vibemail.sidebarCollapsed';

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

/** Icons-only mode (the sidebar's collapse toggle), remembered on this device. */
export function loadSidebarCollapsed(storage: Pick<Storage, 'getItem'> | null = safeStorage()): boolean {
  try {
    return storage?.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // Not remembered when storage is blocked.
  }
}

/** A short mark for a custom label in icons-only mode: "Label_12" → "#12". */
export function labelMark(labelId: string): string {
  const short = labelId.replace(/^Label_/, '').slice(0, 2);
  return `#${short}`;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
