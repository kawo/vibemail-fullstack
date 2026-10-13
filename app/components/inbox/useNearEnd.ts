import { useEffect, useRef } from 'react';

/** Calls `onVisible` when the returned sentinel comes within one screen of the viewport. */
export function useNearEnd(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) {
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && callback.current(), {
      rootMargin: '0px 0px 100% 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return ref;
}
