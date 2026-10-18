/** `/webhook/gmail`: the engine's handler (api/webhook/gmail.ts), served by Next.js. */
export { POST } from '../../../src/endpoints/webhook/gmail';

export const runtime = 'nodejs';
export const maxDuration = 60;
