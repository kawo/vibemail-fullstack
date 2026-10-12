import { DATA_SOURCE } from '@/lib/config';
import { httpSource } from './httpSource';
import { sampleSource } from './sampleSource';
import type { DataSource } from './source';

/**
 * The data source the app talks to: the sample data in Phase 1 (NEXT_PUBLIC_DATA_SOURCE=sample,
 * the default), the engine in Phase 2 (`api`). Nothing else in the app knows which.
 */
export const api: DataSource = DATA_SOURCE === 'api' ? httpSource : sampleSource;

export { ApiError, isAbort, onApiSignal } from './errors';
export type { DataSource } from './source';
