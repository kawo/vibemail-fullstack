/**
 * The `api/` files are one-line bindings. These tests check each exports exactly the contracted
 * methods, and that a request without configuration yields a 500 envelope rather than a crash.
 */
import * as signIn from '../../src/endpoints/v1/auth/google/index';
import * as callback from '../../src/endpoints/v1/auth/google/callback';
import * as list from '../../src/endpoints/v1/messages/index';
import * as send from '../../src/endpoints/v1/messages/send';
import * as read from '../../src/endpoints/v1/messages/[id]/read';
import * as labels from '../../src/endpoints/v1/messages/[id]';
import * as search from '../../src/endpoints/v1/messages/search';
import * as thread from '../../src/endpoints/v1/threads/[threadId]';
import * as drafts from '../../src/endpoints/v1/drafts/index';
import * as draft from '../../src/endpoints/v1/drafts/[draftId]';
import * as webhook from '../../src/endpoints/webhook/gmail';
import * as cron from '../../src/endpoints/cron/renew-watch';

describe('src/endpoints/ handler files (CONTRACT.md §4)', () => {
  it.each([
    ['sign-in', signIn,['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']],
    ['callback', callback, ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']],
    ['messages', list, ['GET', 'OPTIONS']],
    ['send', send, ['OPTIONS', 'POST']],
    ['read', read, ['OPTIONS', 'POST']],
    ['labels', labels, ['OPTIONS', 'PATCH']],
    ['search', search, ['GET', 'OPTIONS']],
    ['thread', thread, ['GET', 'OPTIONS']],
    ['drafts', drafts, ['GET', 'OPTIONS', 'POST']],
    ['draft', draft, ['DELETE', 'OPTIONS', 'PATCH']],
    ['webhook', webhook, ['POST']],
    ['cron', cron, ['GET']],
  ])('%s exports only %j', (_name, module, methods) => {
    expect(Object.keys(module).sort()).toEqual(methods);
  });

  it('returns a 500 envelope when the environment is not configured', async () => {
    const saved = { ...process.env };
    for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'ENCRYPTION_KEY']) {
      delete process.env[name];
    }
    try {
      const response = await list.GET(new Request('https://api.vibemail.test/api/v1/messages'));
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'INTERNAL', retryable: false } });
    } finally {
      process.env = saved;
    }
  });
});
