/**
 * The write paths a restaurant manager uses every day.
 *
 * These matter because each one is the head of a chain: a purchase moves the
 * weighted average price, which moves every recipe using that ingredient; waste
 * and counts move stock, which decides what the menu can still sell. A silent
 * error here is invisible until the month's profit is wrong.
 *
 * Runs against a real Postgres database; skipped when DATABASE_URL is unset.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

const prisma = new PrismaClient();
const d = (v: unknown) => new Decimal(String(v ?? 0));

suite('daily operations', () => {
  let restaurantId: string;
  let userId: string;
  let supplierId: string;
  let ingredientId: string;
  let warehouseId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirst({ where: { slug: 'kajeh' } });
    if (!restaurant) throw new Error('Seed the database first: npm run db:seed');
    restaurantId = restaurant.id;

    const user = await prisma.user.findFirst({ where: { restaurantId } });
    const supplier = await prisma.supplier.findFirst({ where: { restaurantId } });
    const ingredient = await prisma.ingredient.findFirst({
      where: { restaurantId, namePersian: 'برنج ایرانی' },
    });
    const warehouse = await prisma.warehouse.findFirst({
      where: { branch: { restaurantId } },
    });
    if (!user || !supplier || !ingredient || !warehouse) {
      throw new Error('seed data is missing the rows these tests rely on');
    }
    userId = user.id;
    supplierId = supplier.id;
    ingredientId = ingredient.id;
    warehouseId = warehouse.id;
  });

  afterAll(() => prisma.$disconnect());

  async function stock() {
    const level = await prisma.stockLevel.findUnique({
      where: { ingredientId_warehouseId: { ingredientId, warehouseId } },
    });
    return { quantity: d(level?.quantity), avgUnitCost: d(level?.avgUnitCost) };
  }

  it('a purchase converts the invoice unit to the stock unit', async () => {
    // Rice is bought by the kilo but held — and cooked — by the gram, so ten
    // kilos must land as ten thousand grams. Getting this wrong by a factor of
    // a thousand would not look obviously wrong on any single screen.
    const { createPurchase } = await import('@/server/services/operations');
    const { approvePurchase } = await import('@/server/services/purchasing');

    const ingredient = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId },
    });
    const factor = d(ingredient.conversionFactor);
    expect(factor.greaterThan(1)).toBe(true);

    const before = await stock();
    const purchase = await createPurchase({
      restaurantId, userId, supplierId,
      purchaseDate: new Date(),
      lines: [{ ingredientId, quantity: '10', unitPrice: '600000' }],
      approve: false, discountAmount: '0', taxAmount: '0',
    });
    await approvePurchase({ purchaseId: purchase.id, restaurantId, userId });

    const after = await stock();
    expect(after.quantity.minus(before.quantity).toNumber()).toBeCloseTo(
      factor.times(10).toNumber(),
      6,
    );
    // And the carrying cost is per stock unit, not per invoice unit.
    expect(after.avgUnitCost.lessThan(d('600000').dividedBy(factor).times(2))).toBe(true);
  });

  it('a purchase moves the weighted average toward the new price without jumping to it', async () => {
    const { createPurchase } = await import('@/server/services/operations');
    const { approvePurchase } = await import('@/server/services/purchasing');

    const before = await stock();
    const factor = d(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).conversionFactor,
    );
    // Priced per PURCHASE unit, at twice the current carrying cost per STOCK
    // unit. Mixing those two up is the easy mistake, and it silently inverts
    // the direction the average moves.
    const unitPrice = before.avgUnitCost.times(factor).times(2);

    const purchase = await createPurchase({
      restaurantId,
      userId,
      supplierId,
      purchaseDate: new Date(),
      lines: [{ ingredientId, quantity: '10', unitPrice: unitPrice.toFixed(4) }],
      approve: false,
      discountAmount: '0',
      taxAmount: '0',
    });
    expect(purchase.status).toBe('DRAFT');

    await approvePurchase({ purchaseId: purchase.id, restaurantId, userId });

    const after = await stock();
    const perStockUnit = unitPrice.dividedBy(factor);
    // Weighted average, not replacement: it rises, but stops short of the new
    // price because the stock already on hand still counts.
    expect(after.avgUnitCost.greaterThan(before.avgUnitCost)).toBe(true);
    expect(after.avgUnitCost.lessThan(perStockUnit)).toBe(true);
  });

  it('approving the same purchase twice does not receive the stock twice', async () => {
    const { createPurchase } = await import('@/server/services/operations');
    const { approvePurchase } = await import('@/server/services/purchasing');

    const purchase = await createPurchase({
      restaurantId, userId, supplierId,
      purchaseDate: new Date(),
      lines: [{ ingredientId, quantity: '5', unitPrice: '100000' }],
      approve: false, discountAmount: '0', taxAmount: '0',
    });
    await approvePurchase({ purchaseId: purchase.id, restaurantId, userId });
    const once = await stock();

    await expect(
      approvePurchase({ purchaseId: purchase.id, restaurantId, userId }),
    ).rejects.toThrow();

    expect((await stock()).quantity.toString()).toBe(once.quantity.toString());
  });

  it('an invoice-level discount lands in the total without distorting the lines', async () => {
    const { createPurchase } = await import('@/server/services/operations');

    const purchase = await createPurchase({
      restaurantId, userId, supplierId,
      purchaseDate: new Date(),
      lines: [{ ingredientId, quantity: '2', unitPrice: '500000' }],
      approve: false,
      discountAmount: '150000',
      taxAmount: '0',
    });

    const saved = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: { items: true },
    });
    expect(d(saved.subtotal).toNumber()).toBe(1_000_000);
    expect(d(saved.discountAmount).toNumber()).toBe(150_000);
    expect(d(saved.totalAmount).toNumber()).toBe(850_000);
    // The line keeps its own gross value: the discount was on the invoice.
    expect(d(saved.items[0].lineTotal).toNumber()).toBe(1_000_000);
  });

  it('waste is valued at what the stock actually cost, not at list price', async () => {
    const { recordWaste } = await import('@/server/services/operations');

    const before = await stock();
    const waste = await recordWaste({
      restaurantId, userId, ingredientId, quantity: '3', reason: 'SPOILAGE',
    });

    expect(d(waste.unitCost).toNumber()).toBeCloseTo(before.avgUnitCost.toNumber(), 4);
    expect(d(waste.totalCost).toNumber()).toBeCloseTo(
      before.avgUnitCost.times(3).toNumber(),
      2,
    );
    expect((await stock()).quantity.toNumber()).toBeCloseTo(
      before.quantity.minus(3).toNumber(),
      6,
    );
  });

  it('a stock count makes the counted number true and records the variance', async () => {
    const { recordStockCount } = await import('@/server/services/operations');

    const before = await stock();
    const counted = before.quantity.minus(7);

    const result = await recordStockCount({
      restaurantId, userId,
      lines: [{ ingredientId, countedQuantity: counted.toFixed(6) }],
    });
    expect(result.adjusted).toBe(1);

    expect((await stock()).quantity.toNumber()).toBeCloseTo(counted.toNumber(), 6);

    const line = await prisma.inventoryCountLine.findFirstOrThrow({
      where: { countId: result.countId, ingredientId },
    });
    expect(d(line.varianceQty).toNumber()).toBeCloseTo(-7, 6);
    // The shortfall is reported as money, valued at the carrying cost.
    expect(d(line.varianceValue).toNumber()).toBeCloseTo(
      before.avgUnitCost.times(-7).toNumber(),
      2,
    );
  });

  it('a count that matches the system posts no movement', async () => {
    const { recordStockCount } = await import('@/server/services/operations');

    const before = await stock();
    const result = await recordStockCount({
      restaurantId, userId,
      lines: [{ ingredientId, countedQuantity: before.quantity.toFixed(6) }],
    });

    expect(result.linesCounted).toBe(1);
    expect(result.adjusted).toBe(0);
    expect((await stock()).quantity.toString()).toBe(before.quantity.toString());
  });

  it('the ledger still sums exactly to the stock projection after all of this', async () => {
    const movements = await prisma.inventoryTransaction.findMany({
      where: { ingredientId, warehouseId },
      select: { quantity: true },
    });
    const ledger = movements.reduce((sum, m) => sum.plus(d(m.quantity)), d(0));
    expect(ledger.toFixed(6)).toBe((await stock()).quantity.toFixed(6));
  });
});
