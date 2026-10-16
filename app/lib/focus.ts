/**
 * Keeping keyboard focus inside a modal (DESIGN_SPEC.md §3): Tab wraps from the last control to
 * the first, Shift+Tab from the first to the last. Between inner controls the browser moves focus
 * itself.
 */

/** Where Tab (or Shift+Tab, `backwards`) should go instead of the browser's choice, or `null`. */
export function trapTarget<T>(items: readonly T[], current: T, backwards: boolean): T | null {
  if (items.length === 0) {
    return null;
  }
  const first = items[0] as T;
  const last = items[items.length - 1] as T;
  const index = items.indexOf(current);
  if (index === -1) {
    return backwards ? last : first;
  }
  if (backwards && index === 0) {
    return last;
  }
  if (!backwards && index === items.length - 1) {
    return first;
  }
  return null;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** The controls Tab reaches inside `root`, in order, skipping hidden ones. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.getClientRects().length > 0);
}
