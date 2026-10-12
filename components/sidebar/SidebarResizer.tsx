import { useEffect, useRef, useState } from 'react';
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebar,
  loadSidebarWidth,
  saveSidebarWidth,
  widthForKey,
} from '@/lib/sidebarWidth';

function apply(width: number): void {
  document.documentElement.style.setProperty('--size-sidebar', `${width}px`);
}

/**
 * The sidebar's right edge, as a resize handle (768px and wider; CSS hides it on phones).
 * Drag it; or focus it and use ←/→ (Shift for bigger steps), Home/End for the limits, Enter or a
 * double-click to reset. The width is remembered on this device.
 */
export function SidebarResizer({ collapsed }: { collapsed: boolean }) {
  const [width, setWidth] = useState(loadSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const frame = useRef(0);

  // Icons only: a fixed narrow strip, and no handle. Expanding brings back the remembered width.
  useEffect(() => {
    apply(collapsed ? SIDEBAR_COLLAPSED : width);
  }, [width, collapsed]);

  if (collapsed) {
    return null;
  }

  const commit = (next: number) => {
    const w = clampSidebar(next);
    setWidth(w);
    saveSidebarWidth(w);
  };

  return (
    <div
      className={`sidebar-resizer${dragging ? ' dragging' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-controls="sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) {
          return;
        }
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        document.body.classList.add('resizing-sidebar');
      }}
      onPointerMove={(e) => {
        if (!dragging) {
          return;
        }
        const x = e.clientX;
        cancelAnimationFrame(frame.current);
        // Live while dragging, without re-rendering the app on every move.
        frame.current = requestAnimationFrame(() => apply(clampSidebar(x)));
      }}
      onPointerUp={(e) => {
        if (!dragging) {
          return;
        }
        cancelAnimationFrame(frame.current);
        setDragging(false);
        document.body.classList.remove('resizing-sidebar');
        commit(e.clientX);
      }}
      onPointerCancel={() => {
        setDragging(false);
        document.body.classList.remove('resizing-sidebar');
        apply(width);
      }}
      onDoubleClick={() => commit(SIDEBAR_DEFAULT)}
      onKeyDown={(e) => {
        const next = widthForKey(width, e.key, e.shiftKey);
        if (next !== null) {
          e.preventDefault();
          commit(next);
        }
      }}
    />
  );
}
