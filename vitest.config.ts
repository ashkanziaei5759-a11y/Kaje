import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Integration tests share one database; running files in parallel would
    // have them fight over the same rows.
    fileParallelism: false,
    testTimeout: 30_000,
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // Service modules import 'server-only', whose default entry point throws
    // outside a React Server Component. Resolving the react-server condition
    // gives us the no-op build, the same one Next uses on the server.
    conditions: ['react-server', 'node', 'import'],
  },
});
