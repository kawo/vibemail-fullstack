import { describe, expect, it } from 'vitest';
import { trapTarget } from '@/app/lib/focus';

describe('focus trap (DESIGN_SPEC.md §3)', () => {
  const items = ['expand', 'save', 'send', 'close', 'to', 'subject', 'body'];

  it('wraps Tab from the last control to the first', () => {
    expect(trapTarget(items, 'body', false)).toBe('expand');
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    expect(trapTarget(items, 'expand', true)).toBe('body');
  });

  it('leaves Tab between inner controls to the browser', () => {
    expect(trapTarget(items, 'to', false)).toBeNull();
    expect(trapTarget(items, 'to', true)).toBeNull();
  });

  it('pulls focus back in when it is outside', () => {
    expect(trapTarget(items, 'elsewhere', false)).toBe('expand');
    expect(trapTarget(items, 'elsewhere', true)).toBe('body');
  });

  it('does nothing without focusable controls', () => {
    expect(trapTarget([], 'x', false)).toBeNull();
  });
});
