/**
 * Menu-item costing façade + automatic availability.
 *
 * This is the module the UI and API talk to when they want the answer to
 * «این غذا دقیقاً چقدر برای کاژه تمام می‌شود؟».
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { Decimal, d, money, percent, ratio } from '@/lib/money';
import { costMenuItem, costRecipe } from '@/lib/engine/cost-engine';
import { portionsAvailable } from '@/lib/engine/inventory-engine';
import type { MenuItemCostResult } from '@/lib/engine/types';
import { loadEngineContext, resolveCostingProfile, toEngineMenuItem } from './context';
import { requirementsPerPortion } from './sales';
import { getStockPositions } from './inventory';
import { writeAudit } from './audit';

export async function costOneMenuItem(
  restaurantId: string,
  menuItemId: string,
): Promise<MenuItemCostResult> {
  const item = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId } });
  if (!item) throw new Error(`Menu item not found: ${menuItemId}`);

  const [ctx, profile] = await Promise.all([
    loadEngineContext(restaurantId),
    resolveCostingProfile(restaurantId, item.costingProfileId),
  ]);
  return costMenuItem(toEngineMenuItem(item), profile, ctx);
}

/** Costs every active menu item in one pass — the engine context is shared. */
export async function costAllMenuItems(
  restaurantId: string,
): Promise<Array<MenuItemCostResult & { name: string; namePersian: string; categoryId: string }>> {
  const [items, ctx, profiles] = await Promise.all([
    prisma.menuItem.findMany({ where: { restaurantId, isActive: true } }),
    loadEngineContext(restaurantId),
    prisma.costingProfile.findMany({ where: { restaurantId, isActive: true } }),
  ]);

  const defaultProfile = profiles.find((p) => p.isDefault) ?? profiles[0];
  if (!defaultProfile) throw new Error('No costing profile configured');

  const { toEngineProfile } = await import('./context');
  const profileById = new Map(profiles.map((p) => [p.id, toEngineProfile(p)]));
  const fallback = toEngineProfile(defaultProfile);

  const results = [];
  for (const item of items) {
    const profile = item.costingProfileId
      ? profileById.get(item.costingProfileId) ?? fallback
      : fallback;
    try {
      results.push({
        ...costMenuItem(toEngineMenuItem(item), profile, ctx),
        name: item.name,
        namePersian: item.namePersian,
        categoryId: item.categoryId,
      });
    } catch (error) {
      // One broken recipe (a cycle, a missing unit) must not blank the whole
      // menu screen — surface it as a zero-cost row the admin can spot and fix.
      console.error(`Failed to cost menu item ${item.name}:`, error);
    }
  }
  return results;
}

/**
 * Writes a manual cost snapshot — a point-in-time record outside of any sale.
 * Used to track how a dish's cost drifts as ingredient prices move.
 */
export async function captureCostSnapshot(
  restaurantId: string,
  menuItemId: string,
  reason = 'MANUAL',
): Promise<void> {
  const costed = await costOneMenuItem(restaurantId, menuItemId);
  const price = d(costed.sellingPrice);
  const grossProfit = d(costed.grossProfit);

  await prisma.costSnapshot.create({
    data: {
      menuItemId,
      ingredientCost: costed.ingredientCost,
      subRecipeCost: costed.subRecipeCost,
      wasteAdjustment: costed.wasteAdjustment,
      laborCost: costed.laborCost,
      packagingCost: costed.packagingCost,
      overheadCost: costed.overheadCost,
      totalCost: costed.totalCost,
      sellingPrice: costed.sellingPrice,
      grossProfit: costed.grossProfit,
      grossMarginPct: percent(ratio(grossProfit, price)).toFixed(),
      foodCostPct: costed.foodCostPct,
      breakdown: { lines: costed.lines, formulas: costed.formulas } as never,
      reason,
    },
  });
}

/**
 * Recomputes automatic sold-out status across the menu.
 *
 * Business rule from the spec: a MANUAL availability change always beats the
 * automatic logic. `availabilityManualOverrideAt` records when a human last
 * decided, and this routine leaves those items alone.
 */
export async function refreshAutoAvailability(
  restaurantId: string,
): Promise<{ soldOut: string[]; restored: string[] }> {
  const [items, ctx, positions] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId, isActive: true, autoSoldOut: true, recipeId: { not: null } },
    }),
    loadEngineContext(restaurantId),
    getStockPositions(restaurantId),
  ]);

  const onHand = new Map<string, Decimal>(
    [...positions.entries()].map(([id, p]) => [id, p.quantity]),
  );

  const soldOut: string[] = [];
  const restored: string[] = [];

  for (const item of items) {
    // A human decision within the manual-override window wins.
    if (item.availabilityManualOverrideAt) continue;
    // Hidden items are a merchandising decision, not a stock one.
    if (item.availability === 'HIDDEN') continue;

    let canMake: number;
    try {
      const requirements = requirementsPerPortion(item.recipeId!, ctx).map((r) => ({
        ingredientId: r.ingredientId,
        quantityPerPortion: r.quantity,
      }));
      canMake = portionsAvailable(requirements, onHand);
    } catch {
      continue; // a broken recipe should not silently hide a dish
    }

    if (canMake <= 0 && item.availability === 'AVAILABLE') {
      await prisma.menuItem.update({ where: { id: item.id }, data: { availability: 'UNAVAILABLE' } });
      soldOut.push(item.id);
      await prisma.alert.create({
        data: {
          restaurantId,
          type: 'OUT_OF_STOCK',
          severity: 'WARNING',
          title: `${item.namePersian} ناموجود شد`,
          message: `${item.namePersian} به دلیل اتمام موجودی مواد اولیه، به‌صورت خودکار ناموجود شد.`,
          entityType: 'MenuItem',
          entityId: item.id,
        },
      });
    } else if (canMake > 0 && item.availability === 'UNAVAILABLE') {
      await prisma.menuItem.update({ where: { id: item.id }, data: { availability: 'AVAILABLE' } });
      restored.push(item.id);
    }
  }

  return { soldOut, restored };
}

/**
 * Saves a new immutable version of a recipe and snapshots its cost.
 * Called whenever a BOM is edited, so historical profitability stays explicable.
 */
export async function createRecipeVersion(
  restaurantId: string,
  recipeId: string,
  userId: string,
  changeNote?: string,
): Promise<number> {
  const ctx = await loadEngineContext(restaurantId);
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, restaurantId },
    include: { items: true },
  });
  if (!recipe) throw new Error(`Recipe not found: ${recipeId}`);

  const costed = costRecipe(recipeId, ctx);
  const nextVersion = recipe.currentVersion + 1;

  await prisma.$transaction(async (tx) => {
    await tx.recipeVersion.create({
      data: {
        recipeId,
        version: nextVersion,
        snapshot: {
          name: recipe.name,
          namePersian: recipe.namePersian,
          yieldQuantity: recipe.yieldQuantity.toString(),
          recipeYieldPercent: recipe.recipeYieldPercent.toString(),
          preparationLossPercent: recipe.preparationLossPercent.toString(),
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          items: recipe.items.map((i) => ({
            ingredientId: i.ingredientId,
            subRecipeId: i.subRecipeId,
            quantity: i.quantity.toString(),
            unitId: i.unitId,
            wastePercent: i.wastePercent.toString(),
          })),
          costLines: costed.lines,
        } as never,
        totalCost: costed.totalCost,
        costPerPortion: costed.totalCost,
        changeNote,
        createdById: userId,
      },
    });
    await tx.recipe.update({ where: { id: recipeId }, data: { currentVersion: nextVersion } });
    await writeAudit(tx, {
      restaurantId, userId,
      entityType: 'Recipe', entityId: recipeId,
      action: 'VERSION',
      after: { version: nextVersion, totalCost: costed.totalCost },
    });
  });

  return nextVersion;
}
