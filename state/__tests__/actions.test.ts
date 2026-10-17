import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({ updateLabels: vi.fn(), markRead: vi.fn() }));
vi.mock('@/app/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/services')>();
  return { ...actual, api: { ...actual.api, updateLabels: services.updateLabels, markRead: services.markRead } };
});

import { ApiError } from '@/app/services';
import { changeLabels } from '@/state/actions';
import { store } from '@/state/store';

const rateLimited = (seconds: number) =>
  new ApiError(429, { code: 'GMAIL_RATE_LIMITED', message: 'slow down', retryable: true }, seconds);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z'));
  vi.stubGlobal('window', { setTimeout: () => 0 });
  store.reset();
  store.toasts = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('label actions under a Gmail rate limit (DESIGN_SPEC.md shared rules)', () => {
  it('blocks label changes for Retry-After seconds, counting down, without calling the API', async () => {
    services.updateLabels.mockRejectedValueOnce(rateLimited(30));
    await changeLabels('m1', { addLabelIds: ['STARRED'] });
    expect(store.toasts.at(-1)?.text).toBe('Gmail is busy, try again in 30s');

    vi.setSystemTime(new Date('2026-10-17T10:00:12Z'));
    await changeLabels('m2', { removeLabelIds: ['INBOX'] });
    expect(services.updateLabels).toHaveBeenCalledTimes(1);
    expect(store.toasts.at(-1)?.text).toBe('Gmail is busy, try again in 18s');
  });

  it('lets label changes through again once the wait is over', async () => {
    // Later than the previous test's window: the gate is module state, like the Gmail limit.
    vi.setSystemTime(new Date('2026-10-17T11:00:00Z'));
    services.updateLabels.mockRejectedValueOnce(rateLimited(30));
    await changeLabels('m1', { addLabelIds: ['STARRED'] });
    expect(services.updateLabels).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-17T11:00:31Z'));
    services.updateLabels.mockRejectedValueOnce(new ApiError(404, { code: 'MESSAGE_NOT_FOUND', message: 'gone', retryable: false }));
    await changeLabels('m1', { addLabelIds: ['STARRED'] });
    expect(services.updateLabels).toHaveBeenCalledTimes(2);
  });
});
