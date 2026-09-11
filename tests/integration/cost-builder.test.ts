/**
 * The cost builder's contract: a draft preview must be the SAME calculation the
 * save path performs, and saving must move every dependent figure.
 *
 * Runs against a real Postgres database; skipped when DATABASE_URL is unset.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

const prisma = new PrismaClient();

suite('cost builder simulation', () => {
  let restaurantId: string;
  let menuItemId: string;
  let beefId: string;
  let profileId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirst({ where: { slug: 'kajeh' } });
    if (!restaurant) throw new Error('Seed the database first: npm run db:seed');
    restaurantId = restaurant.id;

    menuItemId = (await prisma.menuItem.findFirstOrThrow({
      where: { restaurantId, name: 'Kajeh Special Burger' },
    })).id;
    beefId = (await prisma.ingredient.findFirstOrThrow({
      where: { restaurantId, name: 'Ground Beef' },
    })).id;
    profileId = (await prisma.costingProfile.findFirstOrThrow({
      where: { restaurantId, isDefault: true },
    })).id;
  });

  afterAll(() => prisma.$disconnect());

  it('leaves the result unchanged when the draft is empty', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    const { draft, current } = await simulateMenuItemCost(restaurantId, menuItemId, {});
    expect(draft.totalCost).toBe(current.totalCost);
    expect(draft.recommendedPrice).toBe(current.recommendedPrice);
  });

  it('propagates an ingredient price change through a nested sub-recipe', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');

    // Ground beef reaches the burger only via the Beef Patty sub-recipe, so a
    // change showing up here proves the draft is walking the whole tree.
    const beef = await prisma.ingredient.findUniqueOrThrow({ where: { id: beefId } });
    const doubled = (Number(beef.averagePrice) * 2).toFixed(4);

    const { draft, current } = await simulateMenuItemCost(restaurantId, menuItemId, {
      ingredientPrices: { [beefId]: doubled },
    });

    expect(Number(draft.subRecipeCost)).toBeGreaterThan(Number(current.subRecipeCost));
    expect(Number(draft.totalCost)).toBeGreaterThan(Number(current.totalCost));
    // Margin falls because the stored selling price has not moved.
    expect(Number(draft.grossMarginPct)).toBeLessThan(Number(current.grossMarginPct));
  });

  it('does not persist anything a draft changed', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    const before = await prisma.ingredient.findUniqueOrThrow({ where: { id: beefId } });

    await simulateMenuItemCost(restaurantId, menuItemId, {
      ingredientPrices: { [beefId]: '9999999' },
      profile: { targetGrossMargin: '0.9' },
    });

    const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: beefId } });
    expect(after.averagePrice.toString()).toBe(before.averagePrice.toString());

    const profile = await prisma.costingProfile.findUniqueOrThrow({ where: { id: profileId } });
    expect(Number(profile.targetGrossMargin)).not.toBe(0.9);
  });

  it('raises the recommended price when the target margin rises, leaving cost alone', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    const { draft, current } = await simulateMenuItemCost(restaurantId, menuItemId, {
      profile: { targetGrossMargin: '0.5' },
    });

    expect(draft.totalCost).toBe(current.totalCost);
    expect(Number(draft.recommendedPrice)).toBeGreaterThan(Number(current.recommendedPrice));
  });

  it('lowers the cost when a BOM line is dropped from the draft', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    const item = await prisma.menuItem.findUniqueOrThrow({
      where: { id: menuItemId },
      include: { recipe: { include: { items: true } } },
    });
    const line = item.recipe!.items.find((l) => l.ingredientId)!;

    const { draft, current } = await simulateMenuItemCost(restaurantId, menuItemId, {
      removedLineIds: [line.id],
    });
    expect(Number(draft.totalCost)).toBeLessThan(Number(current.totalCost));
  });

  it('scales cost with a changed BOM quantity', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    const item = await prisma.menuItem.findUniqueOrThrow({
      where: { id: menuItemId },
      include: { recipe: { include: { items: true } } },
    });
    const line = item.recipe!.items.find((l) => l.ingredientId)!;
    const doubled = (Number(line.quantity) * 2).toString();

    const { draft, current } = await simulateMenuItemCost(restaurantId, menuItemId, {
      lineQuantities: { [line.id]: doubled },
    });
    expect(Number(draft.totalCost)).toBeGreaterThan(Number(current.totalCost));
  });

  it('charges more per usable unit when yield falls', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    // Half the yield means twice the raw quantity is needed for the same dish.
    const { draft, current } = await simulateMenuItemCost(restaurantId, menuItemId, {
      ingredientYields: { [beefId]: '0.5' },
    });
    expect(Number(draft.totalCost)).toBeGreaterThan(Number(current.totalCost));
  });

  it('reports an impossible yield as an engine error rather than a silent number', async () => {
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    await expect(
      simulateMenuItemCost(restaurantId, menuItemId, { ingredientYields: { [beefId]: '0' } }),
    ).rejects.toThrow();
  });

  it('agrees exactly with the saved costing once a draft price is written', async () => {
    // This is the property the whole design rests on: preview == saved result.
    const { simulateMenuItemCost } = await import('../../src/server/services/simulate');
    const { costOneMenuItem } = await import('../../src/server/services/costing');

    const beef = await prisma.ingredient.findUniqueOrThrow({ where: { id: beefId } });
    const original = beef.averagePrice.toString();
    const originalLast = beef.lastPurchasePrice.toString();
    const newPrice = (Number(original) * 1.25).toFixed(4);

    const { draft } = await simulateMenuItemCost(restaurantId, menuItemId, {
      ingredientPrices: { [beefId]: newPrice },
    });

    try {
      await prisma.ingredient.update({
        where: { id: beefId },
        data: { averagePrice: newPrice, lastPurchasePrice: newPrice },
      });
      const saved = await costOneMenuItem(restaurantId, menuItemId);

      expect(saved.totalCost).toBe(draft.totalCost);
      expect(saved.ingredientCost).toBe(draft.ingredientCost);
      expect(saved.subRecipeCost).toBe(draft.subRecipeCost);
      expect(saved.recommendedPrice).toBe(draft.recommendedPrice);
    } finally {
      await prisma.ingredient.update({
        where: { id: beefId },
        data: { averagePrice: original, lastPurchasePrice: originalLast },
      });
    }
  });
});
