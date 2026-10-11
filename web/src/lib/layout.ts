import { useEffect, useState } from 'react';

/**
 * Layout breakpoints, shared by CSS (styles.css uses the same widths) and script.
 *
 *   < 768px      phone: one pane; sidebar is a slide-in panel; thread replaces the list
 *   768–1099px   sidebar + one pane; thread replaces the list
 *   ≥ 1100px     sidebar + list + reading pane: the open thread shows beside the list
 */
export const WIDE = '(min-width: 768px)';
export const SPLIT = '(min-width: 1100px)';

export function matches(query: string): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false);
}

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) {
      return;
    }
    const update = () => setValue(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return value;
}
