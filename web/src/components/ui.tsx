import type { ReactNode } from 'react';
import { store, useStore } from '../state/store';

const PATHS = {
  search: 'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  more: 'M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  back: 'M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12l6.6-6.6Z',
  close: 'm6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  refresh: 'M12 5a7 7 0 0 1 6.3 4H15v2h6V5h-2v2.3A9 9 0 1 0 21 13h-2a7 7 0 1 1-7-8Z',
  clip: 'M16.5 6v10.5a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6H9v9.5a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0V6h-1.5Z',
  reply: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z',
  archive: 'M20 4H4v4h16V4ZM5 9v11h14V9H5Zm4 3h6v2H9v-2Z',
  trash: 'M9 3v1H4v2h16V4h-5V3H9Zm-3 5 1 13h10l1-13H6Z',
  compose: 'M3 17.2V21h3.8L17.8 10l-3.8-3.8L3 17.2ZM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8L20.7 7Z',
  send: 'M3 20.5 21 12 3 3.5V10l12 2-12 2v6.5Z',
  expand: 'M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Skeletons({ count, height }: { count: number; height?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={height ? { height } : undefined} />
      ))}
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="glass panel" role="status">
      <div className="orb" aria-hidden="true" />
      <h2>{title}</h2>
      {children}
      {action}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="glass-raised toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                toast.action?.run();
                store.dismissToast(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
