import { PrismaClient } from '@prisma/client';

// Kajeh runs against a real PostgreSQL server whenever DATABASE_URL is set.
//
// When it is not — the public demo build — the whole database runs in-process
// as PGlite (PostgreSQL compiled to WebAssembly), restored from a snapshot that
// was seeded at build time. That keeps the deployed site fully clickable with
// no external service to provision. The trade-off is deliberate and worth
// stating plainly: a demo instance holds its data only for the lifetime of the
// serverless instance, so writes are visible immediately but do not outlive a
// cold start, and separate instances do not share them. Set DATABASE_URL and
// the exact same code becomes a persistent, multi-user deployment.

// KAJEH_DEMO=1 forces the in-process database even when a DATABASE_URL exists,
// which is how the demo snapshot is built and tested locally.
export const DEMO_MODE = process.env.KAJEH_DEMO === '1' || !process.env.DATABASE_URL;

// The build-time snapshot, and the committed SQL dump it is built from.
// See scripts/build-demo-db.ts.
export const DEMO_SNAPSHOT = 'prisma/demo-db.tar.gz';
export const DEMO_DUMP = 'prisma/demo-dump.sql.gz';

function createClient(): PrismaClient {
  if (!DEMO_MODE) {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return createDemoClient();
}

function createDemoClient(): PrismaClient {
  // Required lazily so a normal Postgres deployment never loads the WASM build.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
  const { PrismaPGlite } = require('pglite-prisma-adapter') as typeof import('pglite-prisma-adapter');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const snapshot = path.join(process.cwd(), DEMO_SNAPSHOT);
  const loadDataDir = fs.existsSync(snapshot)
    ? new Blob([fs.readFileSync(snapshot)])
    : undefined;

  if (!loadDataDir) {
    // No snapshot on disk: this is the build-time restore run, which loads the
    // dump into the empty database itself.
    console.warn('[kajeh] demo mode with no snapshot — starting an empty PGlite database');
  }

  const pg = new PGlite(loadDataDir ? { loadDataDir } : undefined);
  demoPGlite = pg;
  return new PrismaClient({ adapter: new PrismaPGlite(pg) } as never);
}

/** The live PGlite handle in demo mode, for the snapshot builder. Never set otherwise. */
export let demoPGlite: import('@electric-sql/pglite').PGlite | undefined;

// Next.js hot-reloads modules in dev; without the global cache each reload
// would open a new pool and exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Interactive-transaction budget. PGlite runs PostgreSQL in WebAssembly on a
 * single thread, so the same batched write that finishes in seconds against a
 * real server can take an order of magnitude longer. Production keeps the tight
 * budget; the demo build gets enough room to seed a full trading history.
 */
export const TX_TIMEOUT_MS = DEMO_MODE ? 300_000 : 30_000;
