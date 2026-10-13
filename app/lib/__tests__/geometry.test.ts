import { describe, expect, it } from 'vitest';
import { drawerGeometry } from '@/app/components/compose/geometry';

describe('compose drawer on a phone (DESIGN_SPEC.md §3 Mobile keyboard behaviour)', () => {
  // A 390 × 844 phone; its software keyboard is 336 px tall.
  const full = 844;

  it('rests at 58% of the screen with no keyboard', () => {
    expect(drawerGeometry({ fullHeight: full, innerHeight: full, visualHeight: full, visualOffsetTop: 0 })).toEqual({
      height: 490,
      keyboardOffset: 0,
    });
  });

  it('sits on the keyboard when iOS shrinks only the visual viewport', () => {
    const g = drawerGeometry({ fullHeight: full, innerHeight: full, visualHeight: full - 336, visualOffsetTop: 0 });
    expect(g.keyboardOffset).toBe(336);
    expect(g.height).toBe(490); // 508 px above the keyboard, so the 58% cap still applies.
    expect(g.height + g.keyboardOffset).toBeLessThanOrEqual(full);
  });

  it('sits on the keyboard when Android resizes the layout viewport', () => {
    const g = drawerGeometry({ fullHeight: full, innerHeight: full - 336, visualHeight: full - 336, visualOffsetTop: 0 });
    expect(g).toEqual({ height: 490, keyboardOffset: 0 });
  });

  it('shrinks to the space above the keyboard and never goes behind it', () => {
    // Landscape-like: 390 px tall, keyboard 250 px, 140 px left above it.
    const g = drawerGeometry({ fullHeight: 390, innerHeight: 390, visualHeight: 140, visualOffsetTop: 0 });
    expect(g).toEqual({ height: 132, keyboardOffset: 250 });
  });

  it('accounts for a visual viewport scrolled down by the browser', () => {
    const g = drawerGeometry({ fullHeight: full, innerHeight: full, visualHeight: 400, visualOffsetTop: 60 });
    expect(g.keyboardOffset).toBe(384);
    expect(g.height).toBe(392);
  });

  it('falls back to the 58% cap without the Visual Viewport API', () => {
    expect(drawerGeometry({ fullHeight: full, innerHeight: full, visualHeight: null, visualOffsetTop: 0 })).toEqual({
      height: 490,
      keyboardOffset: 0,
    });
  });
});
