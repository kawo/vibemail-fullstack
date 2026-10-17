/**
 * Build-time configuration (NEXT_PUBLIC_*, inlined by Next.js). See .env.example.
 *
 * The engine is served from this origin, so API calls need no base URL. The Supabase URL and
 * public anon key let the auth client keep and refresh the session the sign-in hands over.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
