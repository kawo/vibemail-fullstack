import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/app/services/errors';
import { uploadToStorage } from '@/app/services/upload';

const upload = {
  url: 'https://proj.supabase.co/storage/v1/object/upload/sign/attachments/u/a?token=t',
  method: 'PUT' as const,
  headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
  expiresAt: '2026-10-18T12:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('uploadToStorage (CONTRACT.md §4.14)', () => {
  it('PUTs the file to the signed URL with exactly the returned headers and no Authorization', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const file = new Blob(['%PDF'], { type: 'application/pdf' });
    await uploadToStorage(upload, file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(upload.url);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(file);
    const headers = new Headers(init.headers);
    expect(Object.fromEntries(headers.entries())).toEqual(upload.headers);
    expect(headers.has('authorization')).toBe(false);
  });

  it('passes the abort signal through', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const controller = new AbortController();
    await uploadToStorage(upload, new Blob(['x']), controller.signal);
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it.each([400, 413, 500])('rejects with a retryable ApiError when Storage answers %i', async (status) => {
    fetchMock.mockResolvedValue(new Response('{"error":"nope"}', { status }));
    const failure = uploadToStorage(upload, new Blob(['x']));
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ code: 'INTERNAL', canRetry: true });
  });
});
