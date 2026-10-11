import { useEffect, useRef, useState } from 'react';
import { useCompose } from '../../compose/ComposeContext';
import { useInboxUi, useLoadedMessages } from '../../state/inboxUi';
import { Glyph } from '../ui';
import { LabelNav } from './LabelNav';

const WIDE = '(min-width: 768px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? true);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) {
      return;
    }
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * The left sidebar: product name, Compose, and the labels (DESIGN_SPEC.md §4).
 *
 * From 768px it is always shown and stays put while the inbox and threads change beside it.
 * On a phone it is a panel that slides in from the left (opened from the header's menu button),
 * over a scrim; choosing a label, Compose, the scrim or Escape closes it, and focus returns to
 * the menu button. Closed, it is `inert`, so it is out of the tab order.
 */
export function Sidebar() {
  const compose = useCompose();
  const { chip, selectChip, searchActive, menuOpen, setMenuOpen } = useInboxUi();
  const { chips } = useLoadedMessages();
  const wide = useMediaQuery(WIDE);
  const panel = useRef<HTMLElement | null>(null);
  const asPanel = !wide;
  const open = asPanel && menuOpen;

  // Closing the phone panel when the screen widens keeps state from going stale.
  useEffect(() => {
    if (wide && menuOpen) {
      setMenuOpen(false);
    }
  }, [wide, menuOpen, setMenuOpen]);

  // Phone panel: focus its first control on open; Escape closes; focus returns to the opener.
  useEffect(() => {
    if (!open) {
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.classList.add('scroll-locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('scroll-locked');
      opener?.focus();
    };
  }, [open, setMenuOpen]);

  return (
    <>
      {open && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside
        id="sidebar"
        ref={panel}
        className={`sidebar${open ? ' open' : ''}`}
        aria-label="Mailbox"
        role={asPanel ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        inert={asPanel && !open ? true : undefined}
      >
        <div className="sidebar-head">
          <span className="brand">VibeMail</span>
          {asPanel && (
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setMenuOpen(false)}>
              <Glyph name="close" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="primary-btn compose-btn"
          disabled={compose.isOpen}
          onClick={() => {
            setMenuOpen(false);
            compose.open();
          }}
        >
          <Glyph name="compose" /> Compose
        </button>
        <LabelNav chips={chips} active={chip} searching={searchActive} onSelect={selectChip} />
      </aside>
    </>
  );
}
