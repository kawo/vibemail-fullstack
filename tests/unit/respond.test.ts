import { ApiError } from '../../src/middleware/errors';
import { errorResponse } from '../../src/http/respond';

describe('error envelope (CONTRACT.md §3.3)', () => {
  it('maps FILE_TOO_LARGE to 413, not retryable', async () => {
    const response = errorResponse(new ApiError('FILE_TOO_LARGE', 'too large', { details: { maxBytes: 26214400 } }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'FILE_TOO_LARGE', message: 'too large', retryable: false, details: { maxBytes: 26214400 } },
    });
  });
});
