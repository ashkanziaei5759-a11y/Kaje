/**
 * Builds the demo database snapshot shipped with the public deployment.
 *
 * The data is NOT generated here. It is a pg_dump of a database seeded by the
 * real seed script against a real PostgreSQL server (npm run db:dump), because
 * replaying the seed inside PGlite is not workable: WASM PostgreSQL is roughly
 * an order of magnitude slower, and a single order confirmation — recursive BOM
 * costing, stock depletion, a cost snapshot per line — blew past a five-minute
 * transaction budget once the ledger had grown. Restoring a dump is bulk
 * INSERTs and finishes in seconds.
 *
 * The data is still genuine: every row in the dump was written by the real
 * services, not by a fixture.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { prisma, demoPGlite, DEMO_MODE, DEMO_SNAPSHOT, DEMO_DUMP } from '../src/lib/db';

async function build() {
  if (!DEMO_MODE) {
    console.log('[demo-db] DATABASE_URL is set — using the real database, no snapshot needed.');
    return;
  }
  const pg = demoPGlite;
  if (!pg) throw new Error('expected a PGlite instance in demo mode');

  const dumpPath = join(process.cwd(), DEMO_DUMP);
  if (!existsSync(dumpPath)) {
    throw new Error(`missing ${DEMO_DUMP} — regenerate it with: npm run db:dump`);
  }
  const sql = gunzipSync(readFileSync(dumpPath)).toString('utf8');
  console.log(`[demo-db] restoring ${(sql.length / 1024 / 1024).toFixed(1)} MB of SQL …`);

  const started = Date.now();
  await pg.exec(sql);
  console.log(`[demo-db] restored in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const orders = await prisma.order.count();
  const movements = await prisma.inventoryTransaction.count();
  console.log(`[demo-db] ${orders} orders, ${movements} stock movements`);
  if (orders === 0) throw new Error('the restored database is empty');

  const dump = await pg.dumpDataDir('gzip');
  const bytes = Buffer.from(await dump.arrayBuffer());
  writeFileSync(join(process.cwd(), DEMO_SNAPSHOT), bytes);
  console.log(`[demo-db] wrote ${DEMO_SNAPSHOT} — ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
}

build()
  .catch((error) => {
    console.error('[demo-db] failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
