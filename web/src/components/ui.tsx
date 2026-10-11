import type { ReactNode } from 'react';
import { store, useStore } from '../state/store';

/**
 * The design system's iconography: monospaced characters in the running text, never pictures.
 * A glyph-only button always carries an `aria-label`.
 */
const GLYPHS = {
  search: '/',
  star: '★',
  unstar: '☆',
  more: '...',
  back: '<-',
  close: 'x',
  refresh: '↻',
  clip: '[≡]',
  compose: '+',
  expand: '[^]',
  collapse: '[v]',
  done: '[x]',
  alert: '[!]',
  missing: '[-]',
  chevron: '›',
  menu: '≡',
  dot: '●',
  ring: '○',
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <span className={className ? `glyph ${className}` : 'glyph'} aria-hidden="true">
      {GLYPHS[name]}
    </span>
  );
}

export function Skeletons({ count, height }: { count: number; height?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={height ? 'skeleton bare' : 'skeleton'} style={height ? { height } : undefined} />
      ))}
    </div>
  );
}

/**
 * A raised-glass panel for blocking states (errors, reconnect), or, with `empty`, the flat
 * empty state that sits straight on the list.
 */
export function Panel({
  title,
  children,
  action,
  empty = false,
  mark,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  empty?: boolean;
  mark?: GlyphName;
}) {
  if (empty) {
    return (
      <div className="empty" role="status">
        <h2>{title}</h2>
        {children}
      </div>
    );
  }
  return (
    <div className="glass-raised panel" role="status">
      {mark && <Glyph name={mark} className="mark" />}
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
              className="link-btn"
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
