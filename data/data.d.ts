import type { DraftDTO, MessageDTO } from '@/app/services/types';

/** Types for data.js, the Phase 1 sample data (CONTRACT.md §3.4 / §3.7 shapes). */
export declare const SAMPLE_NOW: string;
export declare const SAMPLE_ACCOUNT: { email: string };
export declare const messages: readonly MessageDTO[];
export declare const earlierMessages: readonly MessageDTO[];
export declare const drafts: readonly DraftDTO[];
