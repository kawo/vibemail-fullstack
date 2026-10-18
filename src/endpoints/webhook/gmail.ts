import { handlers } from '../../http';

/**
 * POST /webhook/gmail — CONTRACT.md §4.5.
 * Google-to-server Pub/Sub push, not a client endpoint: outside /api/v1, no bearer, no CORS.
 */
export const POST = handlers.gmailWebhook;
