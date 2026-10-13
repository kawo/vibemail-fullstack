import { describe, expect, it } from 'vitest';
import { TEXT_SCALE, TEXT_SIZES, applyPreferences, parseTextSize, parseTheme, resolveTheme } from '../preferences';

describe('display preferences (DESIGN_SPEC.md §4 Settings)', () => {
  it('defaults to dark and the default size, ignoring unknown stored values', () => {
    expect(parseTheme(null)).toBe('dark');
    expect(parseTheme('sepia')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTextSize(null)).toBe('default');
    expect(parseTextSize('huge')).toBe('default');
    expect(parseTextSize('larger')).toBe('larger');
  });

  it('System follows the device', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('text sizes grow in order, with default at 1', () => {
    const scales = TEXT_SIZES.map((s) => TEXT_SCALE[s]);
    expect(scales).toEqual([...scales].sort((a, b) => a - b));
    expect(TEXT_SCALE.default).toBe(1);
  });

  it('sets the attributes the stylesheet keys on', () => {
    const root = { dataset: {} as Record<string, string>, style: {} as { colorScheme?: string } };
    applyPreferences(root as unknown as HTMLElement, 'light', 'large');
    expect(root.dataset).toEqual({ theme: 'light', textSize: 'large' });
    expect(root.style.colorScheme).toBe('light');
  });
});
