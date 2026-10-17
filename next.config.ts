import type { NextConfig } from 'next';

/**
 * One Next.js project serves the VibeMail Glass web client and the engine on one origin. app/
 * holds the client's routes plus components/, lib/, services/ and styles/ (none of which has a
 * page, so none is routable); app/api/** and app/webhook/** are route files that re-export the
 * engine's handlers from api/. state/ sits at the root.
 *
 * Next type-checks with tsconfig.next.json; the root tsconfig.json and tsconfig.check.json stay
 * the engine's.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { tsconfigPath: 'tsconfig.next.json' },
};

export default config;
