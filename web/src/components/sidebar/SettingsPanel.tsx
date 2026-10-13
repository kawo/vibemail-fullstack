import { type CSSProperties, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEXT_SIZES, type TextSize, THEMES, type ThemePref } from '../../lib/preferences';
import { setTextSize, setTheme, usePreferences } from '../../state/preferences';

const THEME_LABEL: Record<ThemePref, string> = { dark: 'Dark', light: 'Light', system: 'System' };
const SIZE_LABEL: Record<TextSize, string> = { small: 'Small', default: 'Default', large: 'Large', larger: 'Larger' };
/** Each size option shows an "A" at that size, so the choice reads at a glance. */
const SIZE_SAMPLE: Record<TextSize, number> = { small: 11, default: 13, large: 15, larger: 17 };

const GAP = 8;

/**
 * The Settings panel (DESIGN_SPEC.md §4 Settings): raised glass opened from the sidebar's
 * Settings button, with Appearance (Dark, Light, System) and Text size (Small to Larger) as radio
 * groups. A change applies at once and is kept on the device. It opens above the button (beside
 * it when the sidebar shows icons only), at the page's top level so the sidebar's scrolling glass
 * doesn't clip it. In the phone's sidebar panel (a modal dialog) it opens `inline` inside it
 * instead, so it stays within the dialog. Escape, a click outside, or the button again closes it; focus returns to the
 * button.
 */
export function SettingsPanel({
  anchor,
  above,
  beside,
  inline = false,
  onClose,
}: {
  anchor: RefObject<HTMLButtonElement | null>;
  /** What the panel opens above (the whole account foot, so the email stays in view); else the anchor. */
  above?: RefObject<HTMLElement | null>;
  /** Open beside the anchor (the icons-only sidebar) rather than above it. */
  beside: boolean;
  /** Render in place (the phone panel) rather than floating at the page's top level. */
  inline?: boolean;
  onClose: () => void;
}) {
  const { theme, textSize } = usePreferences();
  const panel = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<CSSProperties>({ opacity: 0 });

  useLayoutEffect(() => {
    if (inline) {
      return;
    }
    const position = () => {
      const a = anchor.current?.getBoundingClientRect();
      const over = (above?.current ?? anchor.current)?.getBoundingClientRect();
      const p = panel.current?.getBoundingClientRect();
      if (!a || !p || !over) {
        return;
      }
      const left = beside ? a.right + GAP : Math.max(GAP, Math.min(a.left, window.innerWidth - p.width - GAP));
      const top = beside ? Math.min(a.top, window.innerHeight - p.height - GAP) : over.top - p.height - GAP;
      setPlace({ left, top: Math.max(GAP, top) });
    };
    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [anchor, above, beside, inline, textSize]);

  useEffect(() => {
    const opener = anchor.current;
    panel.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !opener?.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
      opener?.focus();
    };
  }, [anchor, onClose]);

  const content = (
    <div
      ref={panel}
      className={inline ? 'glass-raised settings-panel inline' : 'glass-raised settings-panel'}
      role={inline ? 'group' : 'dialog'}
      aria-label="Settings"
      style={inline ? undefined : place}
    >
      <h2 className="settings-title">Settings</h2>
      <fieldset className="settings-group">
        <legend>Appearance</legend>
        <div className="segmented">
          {THEMES.map((value) => (
            <label key={value} className={theme === value ? 'on' : undefined}>
              <input type="radio" name="vm-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
              {THEME_LABEL[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="settings-group">
        <legend>Text size</legend>
        <div className="segmented">
          {TEXT_SIZES.map((value) => (
            <label key={value} className={textSize === value ? 'on' : undefined} title={SIZE_LABEL[value]}>
              <input
                type="radio"
                name="vm-text-size"
                value={value}
                aria-label={SIZE_LABEL[value]}
                checked={textSize === value}
                onChange={() => setTextSize(value)}
              />
              <span aria-hidden="true" className="size-sample" style={{ fontSize: SIZE_SAMPLE[value] }}>
                A
              </span>
            </label>
          ))}
        </div>
        <p className="settings-note">{SIZE_LABEL[textSize]}</p>
      </fieldset>
    </div>
  );
  return inline ? content : createPortal(content, document.body);
}
