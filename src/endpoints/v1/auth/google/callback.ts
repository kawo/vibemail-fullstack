import { handlers } from '../../../../http';

/** GET /api/v1/auth/google/callback — CONTRACT.md §4.1b (Google redirect; signed state, no bearer). */
export const GET = handlers.oauthCallback;

/** Every other method → 405 METHOD_NOT_ALLOWED with the §3.3 envelope. */
export const POST = handlers.oauthMethodNotAllowed;
export const PUT = handlers.oauthMethodNotAllowed;
export const PATCH = handlers.oauthMethodNotAllowed;
export const DELETE = handlers.oauthMethodNotAllowed;
export const OPTIONS = handlers.oauthMethodNotAllowed;
