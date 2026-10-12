/**
 * Display preferences from the sidebar's Settings (DESIGN_SPEC.md §4 Settings): the theme and the
 * text size. Kept on the device; storage can be unavailable (private mode, blocked site data), so
 * every access is guarded and the defaults apply.
 */

export type ThemePref = 'dark' | 'light' | 'system';
export type TextSize = 'small' | 'default' | 'large' | 'larger';

export const THEMES: readonly ThemePref[] = ['dark', 'light', 'system'];
export const TEXT_SIZES: readonly TextSize[] = ['small', 'default', 'large', 'larger'];

/** How much each text size scales every font size and line height (styles.css `--text-scale`). */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, default: 1, large: 1.12, larger: 1.25 };

export const THEME_KEY = 'vibemail.glass.theme';
export const TEXT_KEY = 'vibemail.glass.textSize';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice lasts for this visit only.
  }
}

/** VibeMail Glass is dark by design, so dark is the default. */
export function parseTheme(value: string | null): ThemePref {
  return THEMES.includes(value as ThemePref) ? (value as ThemePref) : 'dark';
}

export function parseTextSize(value: string | null): TextSize {
  return TEXT_SIZES.includes(value as TextSize) ? (value as TextSize) : 'default';
}

export const loadTheme = (): ThemePref => parseTheme(read(THEME_KEY));
export const loadTextSize = (): TextSize => parseTextSize(read(TEXT_KEY));
export const saveTheme = (theme: ThemePref): void => write(THEME_KEY, theme);
export const saveTextSize = (size: TextSize): void => write(TEXT_KEY, size);

/** The theme actually shown: System follows the device's light or dark setting. */
export function resolveTheme(pref: ThemePref, deviceLight: boolean): 'dark' | 'light' {
  return pref === 'system' ? (deviceLight ? 'light' : 'dark') : pref;
}

/** Sets the attributes styles.css keys on: `data-theme` and `data-text-size` on <html>. */
export function applyPreferences(root: HTMLElement, theme: 'dark' | 'light', size: TextSize): void {
  root.dataset.theme = theme;
  root.dataset.textSize = size;
  root.style.colorScheme = theme;
}
