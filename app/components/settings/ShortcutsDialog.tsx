import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { focusables, trapTarget } from '@/app/lib/focus';
import { isMacPlatform, shortcutGroups } from '@/app/lib/shortcuts';
import { Glyph } from '@/app/components/ui';

/**
 * The keyboard shortcuts list (DESIGN_SPEC.md §1 Account and Settings), opened from Settings: a
 * modal raised-glass panel over a scrim, grouped by where each shortcut works, with ⌘ on Apple
 * devices and Ctrl elsewhere. Like the compose drawer it is modal: the app behind is inert and
 * Tab wraps inside it. Escape, the close button or a click on the scrim closes it; the caller
 * puts focus back on the Settings button.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const groups = useMemo(() => shortcutGroups(isMacPlatform(navigator)), []);

  useEffect(() => {
    const behind = document.querySelector<HTMLElement>('.shell');
    behind?.setAttribute('inert', '');
    closeButton.current?.focus();
    // Capture, so Escape closes only this dialog and not the selection or a panel underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      behind?.removeAttribute('inert');
    };
  }, [onClose]);

  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className="glass-raised panel shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onKeyDown={(e) => {
          if (e.key === 'Tab' && panel.current) {
            const target = trapTarget(focusables(panel.current), document.activeElement as HTMLElement, e.shiftKey);
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }
        }}
      >
        <div className="shortcuts-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={closeButton} type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Glyph name="close" />
          </button>
        </div>
        <div className="shortcuts-body" tabIndex={0} aria-label="Shortcut list">
          {groups.map((group) => (
            <section key={group.title} className="shortcuts-group" aria-labelledby={`shortcuts-${group.title}`}>
              <h3 id={`shortcuts-${group.title}`}>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.action} className="shortcut">
                    <dt>{item.action}</dt>
                    <dd>
                      {item.keys.map((combo, i) => (
                        <span key={combo.join('+')} className="combo">
                          {i > 0 && <span className="or"> or </span>}
                          {combo.map((key, j) => (
                            <span key={key}>
                              {j > 0 && <span className="plus">+</span>}
                              <kbd>{key}</kbd>
                            </span>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
