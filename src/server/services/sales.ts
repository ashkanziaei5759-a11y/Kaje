/**
 * SALE → INVENTORY DEPLETION → COST SNAPSHOT
 *
 * Confirming an order:
 *   1. explodes each line's recipe (and nested sub-recipes) into ingredients,
 *   2. applies modifier BOMs on top (extra cheese adds, no onion removes),
 *   3. merges duplicates so one ingredient produces one movement,
 *   4. deducts the result from inventory,
 *   5. freezes a CostSnapshot per line.
 *
 * Step 5 is what makes historical profitability truthful. Ingredient prices move
 * weekly; a report that re-costs last month's sales at today's prices is fiction.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Decimal, d, money, percent, ratio } from '@/lib/money';
import { costMenuItem, costRecipe } from '@/lib/engine/cost-engine';
import { mergeDepletion, type DepletionLine } from '@/lib/engine/inventory-engine';
import { convert } from '@/lib/units';
import type { EngineContext, CostLine } from '@/lib/engine/types';
import { loadEngineContext, resolveCostingProfile, toEngineMenuItem } from './context';
import { recordMovement } from './inventory';
import { writeAudit } from './audit';

export class SalesError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'SalesError';
  }
}

/**
 * Flattens a costed recipe into the ingredient quantities it consumes.
 *
 * Walks the CostLine tree the engine already produced rather than re-reading
 * the recipes, so depletion and costing can never disagree about what a dish
 * contains — including yield gross-ups. Selling a 250 g portion of an 80%-yield
 * ingredient must remove 312.5 g from the store, not 250 g.
 */
export function explodeToIngredients(lines: CostLine[], multiplier: Decimal = d(1)): DepletionLine[] {
  const out: DepletionLine[] = [];
  for (const line of lines) {
    if (line.kind === 'INGREDIENT') {
      out.push({
        ingredientId: line.refId,
        quantity: d(line.effectiveQuantity).times(multiplier),
      });
    } else if (line.children) {
      // A sub-recipe line's effectiveQuantity is in the sub-recipe's yield unit;
      // its children are stated per full batch, so scale by the fraction of a
      // batch actually consumed.
      out.push(...explodeToIngredients(line.children, multiplier));
    }
  }
  return out;
}

/**
 * Explodes a recipe into ingredient requirements for ONE portion.
 * Used both for depletion and for the "how many portions can we still make?"
 * calculation behind automatic sold-out.
 */
export function requirementsPerPortion(recipeId: string, ctx: EngineContext): DepletionLine[] {
  const result = costRecipe(recipeId, ctx);
  const lines = explodeToIngredients(result.lines);
  // costRecipe reports per-portion cost, but its lines are per batch.
  const recipe = ctx.recipes.get(recipeId)!;
  const yieldQty = d(recipe.yieldQuantity);
  const surviving = d(recipe.recipeYieldPercent).times(
    d(1).minus(d(recipe.preparationLossPercent)),
  );
  return mergeDepletion(
    lines.map((l) => ({
      ingredientId: l.ingredientId,
      quantity: l.quantity.dividedBy(yieldQty).dividedBy(surviving),
    })),
  );
}

export async function confirmOrder(args: {
  orderId: string;
  restaurantId: string;
  userId: string;
  warehouseId?: string;
}): Promise<{ itemsDepleted: number; totalCost: string }> {
  const { orderId, restaurantId, userId } = args;

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          include: {
            menuItem: true,
            modifiers: { include: { modifier: true } },
          },
        },
        branch: { include: { warehouses: true } },
      },
    });

    if (!order) throw new SalesError('Order not found', 'NOT_FOUND');
    if (order.status !== 'DRAFT') {
      throw new SalesError(
        `Only a draft order can be confirmed; this one is ${order.status}`,
        'INVALID_STATUS',
      );
    }
    if (order.items.length === 0) {
      throw new SalesError('An order must have at least one line', 'NO_ITEMS');
    }

    const warehouseId =
      args.warehouseId ??
      order.branch.warehouses.find((w) => w.isDefault)?.id ??
      order.branch.warehouses[0]?.id;
    if (!warehouseId) throw new SalesError('The branch has no warehouse', 'NO_WAREHOUSE');

    const ctx = await loadEngineContext(restaurantId);
    const depletion: DepletionLine[] = [];
    let orderTotalCost = d(0);

    for (const line of order.items) {
      const profile = await resolveCostingProfile(restaurantId, line.menuItem.costingProfileId);
      const costed = costMenuItem(toEngineMenuItem(line.menuItem), profile, ctx);
      const quantity = d(line.quantity);

      // Base recipe consumption.
      if (line.menuItem.recipeId) {
        const perPortion = requirementsPerPortion(line.menuItem.recipeId, ctx);
        depletion.push(
          ...perPortion.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity.times(quantity),
          })),
        );
      }

      // Modifier consumption. quantityFactor is negative for a REMOVAL, which
      // makes the merged quantity smaller — "no onion" genuinely returns onion
      // to stock rather than being a cosmetic label.
      let modifierCost = d(0);
      for (const om of line.modifiers) {
        const modifier = om.modifier;
        if (!modifier.recipeId) continue;
        const factor = d(modifier.quantityFactor).times(om.quantity).times(quantity);
        const perPortion = requirementsPerPortion(modifier.recipeId, ctx);
        depletion.push(
          ...perPortion.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity.times(factor),
          })),
        );
        const modCost = d(costRecipe(modifier.recipeId, ctx).totalCost)
          .times(d(modifier.quantityFactor))
          .times(om.quantity);
        modifierCost = modifierCost.plus(modCost);
        await tx.orderModifier.update({
          where: { id: om.id },
          data: { costDelta: money(modCost).toFixed(4) },
        });
      }

      const unitTotalCost = d(costed.totalCost).plus(modifierCost);
      const unitPrice = d(line.unitPrice);
      const grossProfit = unitPrice.minus(unitTotalCost);
      orderTotalCost = orderTotalCost.plus(unitTotalCost.times(quantity));

      // Freeze the cost. This row is never recalculated.
      await tx.costSnapshot.create({
        data: {
          menuItemId: line.menuItemId,
          orderItemId: line.id,
          ingredientCost: costed.ingredientCost,
          subRecipeCost: costed.subRecipeCost,
          wasteAdjustment: costed.wasteAdjustment,
          laborCost: costed.laborCost,
          packagingCost: costed.packagingCost,
          overheadCost: costed.overheadCost,
          modifierCost: money(modifierCost).toFixed(4),
          totalCost: money(unitTotalCost).toFixed(4),
          sellingPrice: unitPrice.toFixed(4),
          grossProfit: money(grossProfit).toFixed(4),
          grossMarginPct: percent(ratio(grossProfit, unitPrice)).toFixed(),
          foodCostPct: percent(ratio(d(costed.ingredientCost), unitPrice)).toFixed(),
          breakdown: {
            lines: costed.lines,
            formulas: costed.formulas,
            laborMinutes: costed.laborMinutes,
            profileId: profile.id,
          } as unknown as Prisma.InputJsonValue,
          reason: 'SALE',
        },
      });
    }

    // One movement per ingredient, however many lines referenced it.
    const merged = mergeDepletion(depletion);
    for (const line of merged) {
      if (line.quantity.isZero()) continue;
      await recordMovement(tx, {
        ingredientId: line.ingredientId,
        branchId: order.branchId,
        warehouseId,
        // A net-negative requirement (removals exceeding additions) returns stock.
        type: line.quantity.greaterThan(0) ? 'SALE_DEPLETION' : 'SALE_REVERSAL',
        quantity: line.quantity.abs(),
        referenceType: 'Order',
        referenceId: order.id,
        reason: `فروش سفارش ${order.orderNumber}`,
        userId,
        occurredAt: order.placedAt,
      });
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CONFIRMED',
        totalCost: money(orderTotalCost).toFixed(4),
        closedAt: new Date(),
      },
    });

    await writeAudit(tx, {
      restaurantId, userId,
      entityType: 'Order', entityId: order.id,
      action: 'CONFIRM',
      after: { status: 'CONFIRMED', totalCost: money(orderTotalCost).toFixed(4) },
    });

    return { itemsDepleted: merged.length, totalCost: money(orderTotalCost).toFixed() };
  }, { timeout: 30_000 });
}

/**
 * Cancels or refunds a confirmed order, returning stock.
 *
 * The reversal replays the ORIGINAL ledger rows rather than re-exploding the
 * recipe. Recipes change; returning today's BOM for a sale made under last
 * month's BOM would leave inventory permanently skewed.
 */
export async function reverseOrder(args: {
  orderId: string;
  restaurantId: string;
  userId: string;
  status: 'CANCELLED' | 'REFUNDED';
  reason?: string;
}): Promise<{ movementsReversed: number }> {
  const { orderId, restaurantId, userId, status } = args;

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw new SalesError('Order not found', 'NOT_FOUND');
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
      throw new SalesError(`Order is already ${order.status}`, 'ALREADY_REVERSED');
    }
    if (order.status === 'DRAFT') {
      // Nothing was ever deducted, so there is nothing to give back.
      await tx.order.update({ where: { id: order.id }, data: { status } });
      return { movementsReversed: 0 };
    }

    const original = await tx.inventoryTransaction.findMany({
      where: { referenceType: 'Order', referenceId: order.id, type: { in: ['SALE_DEPLETION', 'SALE_REVERSAL'] } },
    });

    for (const movement of original) {
      const quantity = d(movement.quantity);
      await recordMovement(tx, {
        ingredientId: movement.ingredientId,
        branchId: movement.branchId,
        warehouseId: movement.warehouseId,
        type: quantity.lessThan(0) ? 'SALE_REVERSAL' : 'SALE_DEPLETION',
        quantity: quantity.abs(),
        // Return it at the cost it left at, not today's average.
        unitCost: movement.unitCost.toString(),
        referenceType: 'Order',
        referenceId: order.id,
        reason: args.reason ?? `برگشت سفارش ${order.orderNumber}`,
        userId,
      });
    }

    await tx.order.update({ where: { id: order.id }, data: { status } });
    await writeAudit(tx, {
      restaurantId, userId,
      entityType: 'Order', entityId: order.id,
      action: status, before: { status: order.status }, after: { status },
    });

    return { movementsReversed: original.length };
  }, { timeout: 30_000 });
}
