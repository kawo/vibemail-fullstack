/**
 * Build-time configuration (NEXT_PUBLIC_*, inlined by Next.js). See .env.example.
 *
 * Phase 1 runs on the sample data (`sample`, the default); Phase 2 talks to the engine (`api`).
 */
export const DATA_SOURCE: 'sample' | 'api' = process.env.NEXT_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'sample';

/** The engine's origin, e.g. http://localhost:3000 under `vercel dev`. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
