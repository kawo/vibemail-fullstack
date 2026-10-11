import { useEffect, useRef, useState } from 'react';
import { useCompose } from '../../compose/ComposeContext';
import { WIDE, useMediaQuery } from '../../lib/layout';
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../../lib/sidebarWidth';
import { useInboxUi, useLoadedMessages } from '../../state/inboxUi';
import { Glyph } from '../ui';
import { LabelNav } from './LabelNav';
import { SidebarResizer } from './SidebarResizer';

/**
 * The left sidebar: product name, Compose, and the labels (DESIGN_SPEC.md §4).
 *
 * From 768px it is always shown and stays put while the inbox and threads change beside it.
 * On a phone it is a panel that slides in from the left (opened from the header's menu button),
 * over a scrim; choosing a label, Compose, the scrim or Escape closes it, and focus returns to
 * the menu button. Closed, it is `inert`, so it is out of the tab order.
 *
 * Beside the content, a toggle in its header collapses it to icons only (labels become tooltips
 * and stay in the accessible name); the mode is remembered on the device.
 */
export function Sidebar() {
  const compose = useCompose();
  const { chip, selectChip, searchActive, menuOpen, setMenuOpen } = useInboxUi();
  const { chips } = useLoadedMessages();
  const wide = useMediaQuery(WIDE);
  const panel = useRef<HTMLElement | null>(null);
  const asPanel = !wide;
  const open = asPanel && menuOpen;
  const [collapsedPref, setCollapsedPref] = useState(loadSidebarCollapsed);
  const collapsed = wide && collapsedPref;
  const toggleCollapsed = () => {
    setCollapsedPref((v) => {
      saveSidebarCollapsed(!v);
      return !v;
    });
  };

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
        className={`sidebar${open ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}
        aria-label="Mailbox"
        role={asPanel ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        inert={asPanel && !open ? true : undefined}
      >
        <div className="sidebar-head">
          <span className="brand">VibeMail</span>
          {wide && (
            <button
              type="button"
              className="icon-btn collapse-toggle"
              aria-label={collapsed ? 'Show labels' : 'Show icons only'}
              aria-expanded={!collapsed}
              aria-controls="sidebar"
              title={collapsed ? 'Show labels' : 'Show icons only'}
              onClick={toggleCollapsed}
            >
              <Glyph name={collapsed ? 'expandSide' : 'collapseSide'} />
            </button>
          )}
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
          title={collapsed ? 'Compose' : undefined}
          onClick={() => {
            setMenuOpen(false);
            compose.open();
          }}
        >
          <Glyph name="compose" /> <span className="compose-label">Compose</span>
        </button>
        <LabelNav chips={chips} active={chip} searching={searchActive} collapsed={collapsed} onSelect={selectChip} />
      </aside>
      {wide && <SidebarResizer collapsed={collapsed} />}
    </>
  );
}
