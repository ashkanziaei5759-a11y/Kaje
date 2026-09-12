import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';

const t0 = Date.now();
const pg = new PGlite();
await pg.waitReady;
console.log('pglite ready', Date.now() - t0, 'ms');

const dirs = readdirSync('prisma/migrations').filter((d) => /^\d/.test(d)).sort();
for (const d of dirs) {
  const sql = readFileSync(`prisma/migrations/${d}/migration.sql`, 'utf8');
  await pg.exec(sql);
  console.log('applied', d);
}
const prisma = new PrismaClient({ adapter: new PrismaPGlite(pg) });
const r = await prisma.restaurant.create({
  data: { name: 'Kajeh', namePersian: 'کاژه', slug: 'kajeh' },
});
console.log('created', r.id, r.namePersian);
console.log('count', await prisma.restaurant.count());
console.log('total', Date.now() - t0, 'ms');
