import { httpSource } from './httpSource';
import type { DataSource } from './source';

/** The data source the app talks to: the engine, over relative paths on this origin. */
export const api: DataSource = httpSource;

export { ApiError, isAbort, onApiSignal } from './errors';
export type { DataSource } from './source';
