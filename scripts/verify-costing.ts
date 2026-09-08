/**
 * Prints the cost breakdown of every menu item straight from the database.
 * A quick way to sanity-check the engine against real seeded data.
 *   npx tsx --conditions=react-server scripts/verify-costing.ts
 */
import { PrismaClient } from '@prisma/client';
import { costAllMenuItems } from '../src/server/services/costing';

async function main() {
  const prisma = new PrismaClient();
  const restaurant = await prisma.restaurant.findFirst({ where: { slug: 'kajeh' } });
  if (!restaurant) throw new Error('Seed the database first: npm run db:seed');

  const results = await costAllMenuItems(restaurant.id);
  const n = (v: string, w = 9) => Number(v).toLocaleString('en-US').padStart(w);

  console.log('\nMENU ITEM COSTING — computed from seeded data\n');
  console.log(
    'item'.padEnd(22) + '| ingredient |  sub-rcp |   labor |  packag |  overhd |     TOTAL |     price | margin | food%',
  );
  console.log('-'.repeat(122));
  for (const c of results) {
    console.log(
      c.namePersian.padEnd(22) +
      '|' + n(c.ingredientCost, 11) +
      ' |' + n(c.subRecipeCost, 9) +
      ' |' + n(c.laborCost, 8) +
      ' |' + n(c.packagingCost, 8) +
      ' |' + n(c.overheadCost, 8) +
      ' |' + n(c.totalCost, 10) +
      ' |' + n(c.sellingPrice, 10) +
      ' | ' + (Number(c.grossMarginPct) * 100).toFixed(1).padStart(5) + '%' +
      ' | ' + (Number(c.foodCostPct) * 100).toFixed(1) + '%' +
      (c.isBelowMinimumMargin ? '  ⚠ below target' : ''),
    );
  }

  const negative = await prisma.stockLevel.findMany({
    where: { quantity: { lt: 0 } },
    include: { ingredient: true },
  });
  console.log(`\nNegative stock positions: ${negative.length}`);
  for (const s of negative) {
    console.log('  ', s.ingredient.namePersian.padEnd(20), Number(s.quantity).toFixed(0));
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
