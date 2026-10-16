import { useCallback, useEffect, useRef, useState } from 'react';
import { initials } from '@/app/lib/thread';
import { Icon } from '@/app/components/icons';
import { SettingsPanel } from '@/app/components/settings/SettingsPanel';
import { ShortcutsDialog } from '@/app/components/settings/ShortcutsDialog';
import { useAccountEmail } from '@/app/components/sidebar/useAccountEmail';

/**
 * The foot of the sidebar (DESIGN_SPEC.md §4 Settings): the signed-in account's email, then the
 * Settings button that opens the Settings panel, and from it the keyboard shortcuts list. Icons only, the email becomes the initial's
 * tooltip and Settings its icon. In the phone panel, Settings opens inline, above the button.
 */
export function AccountFooter({ collapsed, inline }: { collapsed: boolean; inline: boolean }) {
  const email = useAccountEmail();
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const foot = useRef<HTMLDivElement | null>(null);
  const showShortcuts = () => {
    setOpen(false);
    setShortcuts(true);
  };
  const returnFocus = useRef(false);
  const closeShortcuts = useCallback(() => {
    returnFocus.current = true;
    setShortcuts(false);
  }, []);
  // Focus goes back to Settings once the list has gone and the app behind it is no longer inert.
  useEffect(() => {
    if (!shortcuts && returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus();
    }
  }, [shortcuts]);

  return (
    <div className="account-foot" ref={foot}>
      {open && inline && <SettingsPanel anchor={button} beside={false} inline onClose={() => setOpen(false)} onShowShortcuts={showShortcuts} />}
      {email && (
        <div className="account" title={email}>
          <span className="avatar sm self" aria-hidden="true">
            {initials(email)}
          </span>
          <span className="account-email">
            <span className="sr-only">Signed in as </span>
            {email}
          </span>
        </div>
      )}
      <button
        ref={button}
        type="button"
        className="nav-item settings-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={collapsed ? 'Settings' : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-glyph" aria-hidden="true">
          <Icon name="sliders" />
        </span>
        <span className="nav-label">Settings</span>
      </button>
      {open && !inline && (
        <SettingsPanel anchor={button} above={foot} beside={collapsed} onClose={() => setOpen(false)} onShowShortcuts={showShortcuts} />
      )}
      {shortcuts && <ShortcutsDialog onClose={closeShortcuts} />}
    </div>
  );
}
