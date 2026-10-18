/** `/api/cron/renew-watch`: the engine's handler (api/cron/renew-watch.ts), served by Next.js. */
export { GET } from '../../../../src/endpoints/cron/renew-watch';

export const runtime = 'nodejs';
export const maxDuration = 300;
