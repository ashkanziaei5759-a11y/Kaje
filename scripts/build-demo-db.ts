/**
 * Builds the demo database snapshot shipped with the public deployment.
 *
 * Runs the real seed against an in-process PGlite database, then dumps the
 * whole data directory to prisma/demo-db.tar.gz. At runtime src/lib/db.ts
 * restores that file, so the deployed site has a fully populated Postgres
 * without any external service. Skipped entirely when DATABASE_URL is set.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma, demoPGlite, DEMO_MODE, DEMO_SNAPSHOT } from '../src/lib/db';

async function build() {
  if (!DEMO_MODE) {
    console.log('[demo-db] DATABASE_URL is set — using the real database, no snapshot needed.');
    return;
  }
  const pg = demoPGlite;
  if (!pg) throw new Error('expected a PGlite instance in demo mode');

  const migrations = join(process.cwd(), 'prisma/migrations');
  for (const dir of readdirSync(migrations).filter((d) => /^\d/.test(d)).sort()) {
    await pg.exec(readFileSync(join(migrations, dir, 'migration.sql'), 'utf8'));
    console.log('[demo-db] applied', dir);
  }

  const { main } = await import('../prisma/seed');
  await main();

  const dump = await pg.dumpDataDir('gzip');
  const bytes = Buffer.from(await dump.arrayBuffer());
  writeFileSync(join(process.cwd(), DEMO_SNAPSHOT), bytes);
  console.log(`[demo-db] wrote ${DEMO_SNAPSHOT} — ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

// NOTE: the npm script deletes any previous snapshot before this file runs.
// It has to happen before src/lib/db.ts is imported, or the stale snapshot
// would be restored instead of rebuilt.
build()
  .catch((error) => {
    console.error('[demo-db] failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
