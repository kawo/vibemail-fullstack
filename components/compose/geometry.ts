/**
 * Where the compose drawer sits on a phone (DESIGN_SPEC.md §3, Mobile keyboard behaviour).
 *
 * - The drawer is never taller than 58% of the screen's full height (`fullHeight`: the viewport
 *   height with no keyboard open), keyboard or not.
 * - When the keyboard is open, the drawer sits on top of it (`keyboardOffset` from the bottom of
 *   the layout viewport) and shrinks to the space above it, minus a small gap, so it never
 *   extends behind the keyboard.
 *
 * Works for both keyboard models: iOS keeps the layout viewport and shrinks the visual viewport;
 * Chrome on Android with `interactive-widget=resizes-content` shrinks both.
 */

export const MAX_HEIGHT_RATIO = 0.58;
export const KEYBOARD_GAP = 8;

export interface ViewportSample {
  /** The tallest layout-viewport height seen at this width (no keyboard). */
  fullHeight: number;
  /** `window.innerHeight` now. */
  innerHeight: number;
  /** `visualViewport.height` and `.offsetTop` now, or null without the Visual Viewport API. */
  visualHeight: number | null;
  visualOffsetTop: number;
}

export interface DrawerGeometry {
  height: number;
  keyboardOffset: number;
}

export function drawerGeometry(v: ViewportSample): DrawerGeometry {
  const cap = Math.round(v.fullHeight * MAX_HEIGHT_RATIO);
  if (v.visualHeight === null) {
    return { height: Math.min(cap, v.innerHeight), keyboardOffset: 0 };
  }
  const keyboardOffset = Math.max(0, Math.round(v.innerHeight - v.visualHeight - v.visualOffsetTop));
  const above = Math.max(0, Math.floor(v.visualHeight - KEYBOARD_GAP));
  return { height: Math.min(cap, above), keyboardOffset };
}
