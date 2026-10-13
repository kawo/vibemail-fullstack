import { useSyncExternalStore } from 'react';
import {
  type TextSize,
  type ThemePref,
  applyPreferences,
  loadTextSize,
  loadTheme,
  resolveTheme,
  saveTextSize,
  saveTheme,
} from '@/app/lib/preferences';

/**
 * The display preferences as live state: changing one re-applies it to <html> at once and saves
 * it on the device (localStorage). The inline script in the root layout (themeScript.ts) has
 * already applied the stored choice before the first paint, so the page never flashes the wrong
 * theme; this takes over once the app runs, and with System follows the device as it changes.
 */
interface Preferences {
  theme: ThemePref;
  textSize: TextSize;
}

let current: Preferences = { theme: 'dark', textSize: 'default' };
const listeners = new Set<() => void>();
const deviceLight = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

function apply(): void {
  applyPreferences(document.documentElement, resolveTheme(current.theme, deviceLight?.matches ?? false), current.textSize);
}

function set(patch: Partial<Preferences>): void {
  current = { ...current, ...patch };
  apply();
  for (const listener of listeners) {
    listener();
  }
}

export function startPreferences(): void {
  current = { theme: loadTheme(), textSize: loadTextSize() };
  apply();
  deviceLight?.addEventListener('change', () => current.theme === 'system' && apply());
}

export function setTheme(theme: ThemePref): void {
  saveTheme(theme);
  set({ theme });
}

export function setTextSize(textSize: TextSize): void {
  saveTextSize(textSize);
  set({ textSize });
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
