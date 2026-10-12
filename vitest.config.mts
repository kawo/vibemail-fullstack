import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** The web client's unit tests. The engine's tests (tests/) stay with Jest (`npm test`). */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    include: ['{lib,components,services,state}/**/*.test.ts'],
    environment: 'node',
  },
});
