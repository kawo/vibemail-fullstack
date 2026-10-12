import type { NextConfig } from 'next';

/**
 * The VibeMail Glass web client: a Next.js (App Router) app at the repo root, beside the engine.
 * Routes are in app/; components/, lib/, state/, services/, styles/ and data/ hold the rest.
 *
 * It talks to the engine (api/, Vercel functions) over CONTRACT.md §4 at NEXT_PUBLIC_API_URL, so
 * there are no rewrites or API routes here. Next type-checks with tsconfig.next.json; the root
 * tsconfig.json and tsconfig.check.json stay the engine's.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { tsconfigPath: 'tsconfig.next.json' },
};

export default config;
