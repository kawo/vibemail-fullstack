import type { ErrorCode, ErrorEnvelope } from './types';

/** A CONTRACT.md §3.3 error envelope, with the `Retry-After` header when Gmail rate-limited the call. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, envelope: ErrorEnvelope['error'], retryAfterSeconds?: number) {
    super(envelope.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = envelope.code;
    this.retryable = envelope.retryable;
    this.details = envelope.details;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** The shared retry rule: offer Retry when `retryable`, or for `INTERNAL`. */
  get canRetry(): boolean {
    return this.retryable || this.code === 'INTERNAL';
  }
}

/** App-wide signals the views react to: signed out, or Gmail needs reconnecting. */
export type ApiSignal = 'signed-out' | 'reconnect';
const listeners = new Set<(signal: ApiSignal) => void>();

export function onApiSignal(listener: (signal: ApiSignal) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitApiSignal(signal: ApiSignal): void {
  for (const listener of listeners) {
    listener(signal);
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
