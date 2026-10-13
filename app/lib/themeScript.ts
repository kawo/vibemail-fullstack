import { TEXT_KEY, TEXT_SIZES, THEME_KEY, THEMES } from '@/app/lib/preferences';

/**
 * Runs inline in <head> before the first paint (app/layout.tsx). The server can't know the
 * device's stored theme and text size, so this applies them to <html> straight away; the page
 * never flashes dark before switching to light. It mirrors lib/preferences.ts: the same keys,
 * the same defaults (dark, default size), System following the device.
 */
export const themeScript = `(function () {
  try {
    var themes = ${JSON.stringify(THEMES)};
    var sizes = ${JSON.stringify(TEXT_SIZES)};
    var theme = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var size = localStorage.getItem(${JSON.stringify(TEXT_KEY)});
    if (themes.indexOf(theme) < 0) theme = 'dark';
    if (sizes.indexOf(size) < 0) size = 'default';
    if (theme === 'system') theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.textSize = size;
    root.style.colorScheme = theme;
  } catch (e) {}
})();`;
