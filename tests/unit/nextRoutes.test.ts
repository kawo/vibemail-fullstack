/**
 * One Next.js project serves the engine: every src/endpoints/ handler has a route file at the same public
 * path that re-exports exactly its HTTP methods, on the Node.js runtime, with the durations that
 * vercel.json used to set.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** src/endpoints/v1/messages/index.ts → app/api/v1/messages/route.ts; src/endpoints/webhook/gmail.ts → app/webhook/gmail/route.ts. */
function routeFor(apiFile: string): string {
  const rel = path.relative(path.join(ROOT, 'src', 'endpoints'), apiFile).replace(/\\/g, '/').replace(/\.ts$/, '');
  const routePath = rel.endsWith('/index') ? rel.slice(0, -'/index'.length) : rel;
  const base = routePath.startsWith('webhook/') ? path.join(ROOT, 'app') : path.join(ROOT, 'app', 'api');
  return path.join(base, routePath, 'route.ts');
}

const apiFiles = walk(path.join(ROOT, 'src', 'endpoints'));

describe('Next.js route re-exports of the engine', () => {
  // Vercel builds a top-level api/ folder as standalone functions even under the Next.js preset.
  // Those land on the same output paths as the grouped Next.js route functions and replace them,
  // so routes run another route's handler (docs/deploy-routing-issue.md).
  it('keeps no top-level api/ folder', () => expect(existsSync(path.join(ROOT, 'api'))).toBe(false));

  it('finds every engine handler', () => expect(apiFiles).toHaveLength(12));

  it.each(apiFiles.map((f) => [path.relative(ROOT, f).replace(/\\/g, '/'), f]))('%s has a matching route', async (_name, apiFile) => {
    const handler = (await import(apiFile)) as Record<string, unknown>;
    const route = (await import(routeFor(apiFile))) as Record<string, unknown>;
    const methodsOf = (m: Record<string, unknown>) => Object.keys(m).filter((k) => METHODS.includes(k)).sort();
    expect(methodsOf(route)).toEqual(methodsOf(handler));
    for (const method of methodsOf(handler)) {
      expect(route[method]).toBe(handler[method]);
    }
    expect(route.runtime).toBe('nodejs');
  });

  it.each([
    ['src/endpoints/v1/auth/google/callback.ts', 60],
    ['src/endpoints/webhook/gmail.ts', 60],
    ['src/endpoints/cron/renew-watch.ts', 300],
  ])('%s keeps maxDuration %i', async (apiFile, seconds) => {
    const route = (await import(routeFor(path.join(ROOT, apiFile)))) as Record<string, unknown>;
    expect(route.maxDuration).toBe(seconds);
  });
});
