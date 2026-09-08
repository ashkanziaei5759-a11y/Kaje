/**
 * End-to-end test of the connected chain the specification demands:
 *
 *   supplier purchase → ingredient price → inventory → BOM → menu cost
 *   → recommended price → sale → depletion → cost snapshot → reports
 *
 * Runs against a real Postgres database. Skipped automatically when
 * DATABASE_URL is unset, so `npm test` still works without one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { d } from '../../src/lib/money';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

const prisma = new PrismaClient();

suite('the connected chain', () => {
  let restaurantId: string;
  let branchId: string;
  let warehouseId: string;
  let userId: string;
  let supplierId: string;
  let unitKg: string;
  let unitG: string;
  let unitPiece: string;

  beforeAll(async () => {
    // A dedicated tenant, so the test never disturbs the demo data.
    await cleanup();

    const restaurant = await prisma.restaurant.create({
      data: { name: 'Test', namePersian: 'آزمون', slug: 'test-chain' },
    });
    restaurantId = restaurant.id;

    const branch = await prisma.branch.create({
      data: { restaurantId, name: 'B', namePersian: 'ش', code: 'T1' },
    });
    branchId = branch.id;

    const warehouse = await prisma.warehouse.create({
      data: { branchId, name: 'W', namePersian: 'ا', isDefault: true },
    });
    warehouseId = warehouse.id;

    const role = await prisma.role.upsert({
      where: { name: 'OWNER' },
      update: {},
      create: { name: 'OWNER', labelPersian: 'مالک', permissions: ['*'] },
    });
    const user = await prisma.user.create({
      data: {
        restaurantId, branchId, roleId: role.id,
        email: `chain-${Date.now()}@test.local`, passwordHash: 'x', name: 'Tester',
      },
    });
    userId = user.id;

    const supplier = await prisma.supplier.create({
      data: { restaurantId, name: 'S', namePersian: 'ت' },
    });
    supplierId = supplier.id;

    const units = await Promise.all([
      prisma.unitDefinition.create({
        data: { restaurantId, code: 'kg', labelPersian: 'kg', dimension: 'MASS', factorToBase: '1000' },
      }),
      prisma.unitDefinition.create({
        data: { restaurantId, code: 'g', labelPersian: 'g', dimension: 'MASS', factorToBase: '1' },
      }),
      prisma.unitDefinition.create({
        data: { restaurantId, code: 'piece', labelPersian: 'piece', dimension: 'COUNT', factorToBase: '1' },
      }),
    ]);
    [unitKg, unitG, unitPiece] = units.map((u) => u.id);

    await prisma.costingProfile.create({
      data: {
        restaurantId, name: 'Default', namePersian: 'پیش‌فرض', isDefault: true,
        laborMethod: 'PER_MINUTE', laborCostPerMinute: '2000',
        overheadMethod: 'PER_UNIT', monthlyOverheadCost: '300000000',
        expectedMonthlyUnits: 10000,
        pricingStrategy: 'TARGET_GROSS_MARGIN', targetGrossMargin: '0.30',
        minimumMargin: '0.15', roundingRule: 'NONE',
        taxRate: '0', taxInclusive: true, wasteBufferPct: '0',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /**
   * Tears down in dependency order. The FKs from StockLevel and
   * InventoryTransaction to Branch deliberately do not cascade — deleting a
   * branch that still holds stock should fail loudly in production — so the
   * stock-bearing rows have to go first.
   */
  async function cleanup() {
    const restaurant = await prisma.restaurant.findUnique({ where: { slug: 'test-chain' } });
    if (!restaurant) return;
    const id = restaurant.id;

    await prisma.costSnapshot.deleteMany({ where: { menuItem: { restaurantId: id } } });
    await prisma.orderModifier.deleteMany({ where: { orderItem: { order: { restaurantId: id } } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: id } } });
    await prisma.order.deleteMany({ where: { restaurantId: id } });
    await prisma.inventoryTransaction.deleteMany({ where: { ingredient: { restaurantId: id } } });
    await prisma.stockLevel.deleteMany({ where: { ingredient: { restaurantId: id } } });
    await prisma.waste.deleteMany({ where: { restaurantId: id } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { restaurantId: id } } });
    await prisma.purchase.deleteMany({ where: { restaurantId: id } });
    // BOM lines hold Restrict references to ingredients and sub-recipes, so the
    // recipe structure has to come apart before the ingredients it points at.
    await prisma.recipeVersion.deleteMany({ where: { recipe: { restaurantId: id } } });
    await prisma.menuItem.deleteMany({ where: { restaurantId: id } });
    await prisma.recipeItem.deleteMany({ where: { recipe: { restaurantId: id } } });
    await prisma.recipe.deleteMany({ where: { restaurantId: id } });
    await prisma.ingredient.deleteMany({ where: { restaurantId: id } });
    await prisma.restaurant.delete({ where: { id } });
  }

  it('carries a purchase through to inventory, price history and dish cost', async () => {
    const { approvePurchase } = await import('../../src/server/services/purchasing');
    const { costOneMenuItem } = await import('../../src/server/services/costing');

    // An ingredient bought by the kilo, cooked by the gram.
    const chicken = await prisma.ingredient.create({
      data: {
        restaurantId, name: 'Chicken', namePersian: 'مرغ',
        purchaseUnitId: unitKg, recipeUnitId: unitG, conversionFactor: '1000',
        yieldPercent: '1', defaultSupplierId: supplierId,
      },
    });

    // Buy 10 kg for 8,500,000 — the specification's own example.
    const purchase = await prisma.purchase.create({
      data: {
        restaurantId, branchId, supplierId,
        invoiceNumber: 'T-001', purchaseDate: new Date(), status: 'DRAFT',
        subtotal: '8500000', totalAmount: '8500000',
        items: {
          create: [{
            ingredientId: chicken.id, quantity: '10', unitId: unitKg,
            unitPrice: '850000', lineTotal: '8500000',
          }],
        },
      },
    });

    await approvePurchase({ purchaseId: purchase.id, restaurantId, userId, warehouseId });

    // Inventory carries 10,000 g at 850 per gram.
    const stock = await prisma.stockLevel.findFirst({
      where: { ingredientId: chicken.id, warehouseId },
    });
    expect(Number(stock!.quantity)).toBe(10_000);
    expect(Number(stock!.avgUnitCost)).toBe(850);

    // The ingredient's own price is updated, and history records the change.
    const updated = await prisma.ingredient.findUnique({ where: { id: chicken.id } });
    expect(Number(updated!.averagePrice)).toBe(850_000);

    const history = await prisma.ingredientPriceHistory.findMany({
      where: { ingredientId: chicken.id },
    });
    expect(history).toHaveLength(1);
    expect(Number(history[0].price)).toBe(850_000);

    const movements = await prisma.inventoryTransaction.findMany({
      where: { referenceType: 'Purchase', referenceId: purchase.id },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe('PURCHASE_RECEIPT');

    // A recipe using 250 g, and a menu item on top of it.
    const recipe = await prisma.recipe.create({
      data: {
        restaurantId, name: 'Kebab', namePersian: 'کباب', type: 'MENU_ITEM',
        yieldQuantity: '1', yieldUnitId: unitPiece,
        prepTimeMinutes: 8, cookTimeMinutes: 7, // 15 min -> 30,000 labour
        items: { create: [{ ingredientId: chicken.id, quantity: '250', unitId: unitG }] },
      },
    });

    const category = await prisma.menuCategory.create({
      data: { restaurantId, name: 'Main', namePersian: 'اصلی' },
    });

    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId, categoryId: category.id, recipeId: recipe.id,
        name: 'Kebab', namePersian: 'کباب', priceIsOverridden: false,
      },
    });

    // The cost engine sees the purchase without being told about it.
    const costed = await costOneMenuItem(restaurantId, menuItem.id);
    expect(costed.ingredientCost).toBe('212500');   // 250 g x 850
    expect(costed.laborCost).toBe('30000');         // 15 min x 2,000
    expect(costed.overheadCost).toBe('30000');      // 300M / 10,000
    expect(costed.totalCost).toBe('272500');
    expect(Number(costed.recommendedPrice)).toBeCloseTo(389_285.7143, 3);
  });

  it('raises the dish cost when the next delivery costs more', async () => {
    const { approvePurchase } = await import('../../src/server/services/purchasing');
    const { costOneMenuItem } = await import('../../src/server/services/costing');

    const chicken = await prisma.ingredient.findFirstOrThrow({
      where: { restaurantId, name: 'Chicken' },
    });
    const menuItem = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId } });
    const before = await costOneMenuItem(restaurantId, menuItem.id);

    // 10 kg more, this time at 1,050,000/kg — a 23.5% jump.
    const purchase = await prisma.purchase.create({
      data: {
        restaurantId, branchId, supplierId,
        invoiceNumber: 'T-002', purchaseDate: new Date(), status: 'DRAFT',
        subtotal: '10500000', totalAmount: '10500000',
        items: {
          create: [{
            ingredientId: chicken.id, quantity: '10', unitId: unitKg,
            unitPrice: '1050000', lineTotal: '10500000',
          }],
        },
      },
    });
    const result = await approvePurchase({ purchaseId: purchase.id, restaurantId, userId, warehouseId });

    // A jump over the 10% threshold raises an alert.
    expect(result.alertsRaised).toBe(1);
    const alert = await prisma.alert.findFirst({
      where: { restaurantId, type: 'INGREDIENT_PRICE_INCREASE' },
    });
    expect(alert).not.toBeNull();

    // Moving average blends both: (10,000x850 + 10,000x1,050)/20,000 = 950
    const stock = await prisma.stockLevel.findFirst({
      where: { ingredientId: chicken.id, warehouseId },
    });
    expect(Number(stock!.avgUnitCost)).toBe(950);

    // And the dish costs more without anyone editing the recipe.
    const after = await costOneMenuItem(restaurantId, menuItem.id);
    expect(after.ingredientCost).toBe('237500'); // 250 x 950
    expect(Number(after.totalCost)).toBeGreaterThan(Number(before.totalCost));
    expect(Number(after.recommendedPrice)).toBeGreaterThan(Number(before.recommendedPrice));
  });

  it('depletes stock and freezes a cost snapshot when an order is confirmed', async () => {
    const { confirmOrder } = await import('../../src/server/services/sales');

    const chicken = await prisma.ingredient.findFirstOrThrow({
      where: { restaurantId, name: 'Chicken' },
    });
    const menuItem = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId } });

    const stockBefore = await prisma.stockLevel.findFirstOrThrow({
      where: { ingredientId: chicken.id, warehouseId },
    });

    // Sell 10 portions — the specification's example.
    const order = await prisma.order.create({
      data: {
        restaurantId, branchId, orderNumber: `T-${Date.now()}`, status: 'DRAFT',
        subtotal: '5000000', totalAmount: '5000000',
        items: {
          create: [{
            menuItemId: menuItem.id, quantity: 10,
            unitPrice: '500000', lineTotal: '5000000',
          }],
        },
      },
    });

    await confirmOrder({ orderId: order.id, restaurantId, userId, warehouseId });

    // 250 g x 10 = 2,500 g deducted.
    const stockAfter = await prisma.stockLevel.findFirstOrThrow({
      where: { ingredientId: chicken.id, warehouseId },
    });
    expect(Number(stockBefore.quantity) - Number(stockAfter.quantity)).toBe(2_500);
    // Issuing stock must not disturb the average cost.
    expect(Number(stockAfter.avgUnitCost)).toBe(Number(stockBefore.avgUnitCost));

    // The snapshot froze cost and price as they stood at sale time.
    const snapshot = await prisma.costSnapshot.findFirstOrThrow({
      where: { menuItemId: menuItem.id, reason: 'SALE' },
      orderBy: { capturedAt: 'desc' },
    });
    expect(Number(snapshot.ingredientCost)).toBe(237_500);
    expect(Number(snapshot.sellingPrice)).toBe(500_000);
    expect(Number(snapshot.grossProfit)).toBe(500_000 - Number(snapshot.totalCost));
  });

  it('preserves historical profit when ingredient prices move afterwards', async () => {
    const { approvePurchase } = await import('../../src/server/services/purchasing');

    const chicken = await prisma.ingredient.findFirstOrThrow({
      where: { restaurantId, name: 'Chicken' },
    });
    const menuItem = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId } });

    const snapshotBefore = await prisma.costSnapshot.findFirstOrThrow({
      where: { menuItemId: menuItem.id, reason: 'SALE' },
      orderBy: { capturedAt: 'desc' },
    });

    // Prices roughly double after the sale.
    const purchase = await prisma.purchase.create({
      data: {
        restaurantId, branchId, supplierId,
        invoiceNumber: 'T-003', purchaseDate: new Date(), status: 'DRAFT',
        subtotal: '40000000', totalAmount: '40000000',
        items: {
          create: [{
            ingredientId: chicken.id, quantity: '20', unitId: unitKg,
            unitPrice: '2000000', lineTotal: '40000000',
          }],
        },
      },
    });
    await approvePurchase({ purchaseId: purchase.id, restaurantId, userId, warehouseId });

    // The historical snapshot is untouched — this is what makes past reports true.
    const snapshotAfter = await prisma.costSnapshot.findUniqueOrThrow({
      where: { id: snapshotBefore.id },
    });
    expect(snapshotAfter.totalCost.toString()).toBe(snapshotBefore.totalCost.toString());
    expect(snapshotAfter.ingredientCost.toString()).toBe(snapshotBefore.ingredientCost.toString());
    expect(snapshotAfter.grossProfit.toString()).toBe(snapshotBefore.grossProfit.toString());
  });

  it('returns stock at its original cost when an order is reversed', async () => {
    const { confirmOrder, reverseOrder } = await import('../../src/server/services/sales');

    const chicken = await prisma.ingredient.findFirstOrThrow({
      where: { restaurantId, name: 'Chicken' },
    });
    const menuItem = await prisma.menuItem.findFirstOrThrow({ where: { restaurantId } });

    const before = await prisma.stockLevel.findFirstOrThrow({
      where: { ingredientId: chicken.id, warehouseId },
    });

    const order = await prisma.order.create({
      data: {
        restaurantId, branchId, orderNumber: `R-${Date.now()}`, status: 'DRAFT',
        subtotal: '500000', totalAmount: '500000',
        items: {
          create: [{
            menuItemId: menuItem.id, quantity: 2,
            unitPrice: '500000', lineTotal: '1000000',
          }],
        },
      },
    });

    await confirmOrder({ orderId: order.id, restaurantId, userId, warehouseId });
    const depleted = await prisma.stockLevel.findFirstOrThrow({
      where: { ingredientId: chicken.id, warehouseId },
    });
    expect(Number(before.quantity) - Number(depleted.quantity)).toBe(500);

    await reverseOrder({ orderId: order.id, restaurantId, userId, status: 'REFUNDED' });

    const restored = await prisma.stockLevel.findFirstOrThrow({
      where: { ingredientId: chicken.id, warehouseId },
    });
    expect(Number(restored.quantity)).toBe(Number(before.quantity));
    // Returning stock must not distort the valuation.
    expect(Number(restored.avgUnitCost)).toBe(Number(before.avgUnitCost));

    const reversed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reversed.status).toBe('REFUNDED');
  });

  it('refuses to approve the same purchase twice', async () => {
    const { approvePurchase } = await import('../../src/server/services/purchasing');

    const approved = await prisma.purchase.findFirstOrThrow({
      where: { restaurantId, status: 'APPROVED' },
    });

    await expect(
      approvePurchase({ purchaseId: approved.id, restaurantId, userId, warehouseId }),
    ).rejects.toThrow(/already been approved/);

    // The double-click did not receive the stock a second time.
    const movements = await prisma.inventoryTransaction.count({
      where: { referenceType: 'Purchase', referenceId: approved.id },
    });
    expect(movements).toBe(1);
  });

  it('refuses to confirm an order twice', async () => {
    const { confirmOrder } = await import('../../src/server/services/sales');
    const confirmed = await prisma.order.findFirstOrThrow({
      where: { restaurantId, status: 'CONFIRMED' },
    });
    await expect(
      confirmOrder({ orderId: confirmed.id, restaurantId, userId, warehouseId }),
    ).rejects.toThrow(/draft order/);
  });

  it('keeps the ledger and the stock projection in agreement', async () => {
    // StockLevel is a cached projection of InventoryTransaction. If the two ever
    // disagree, every valuation and variance figure in the system is wrong.
    const levels = await prisma.stockLevel.findMany({
      where: { ingredient: { restaurantId } },
    });
    expect(levels.length).toBeGreaterThan(0);

    for (const level of levels) {
      const movements = await prisma.inventoryTransaction.findMany({
        where: { ingredientId: level.ingredientId, warehouseId: level.warehouseId },
      });
      const ledgerBalance = movements.reduce(
        (acc, m) => acc.plus(d(m.quantity.toString())), d(0),
      );
      expect(ledgerBalance.toFixed(6)).toBe(d(level.quantity.toString()).toFixed(6));
    }
  });
});
