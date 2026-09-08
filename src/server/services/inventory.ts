/**
 * Persistence wrapper around the pure inventory engine.
 *
 * Invariant: StockLevel is only ever changed here, and every change writes a
 * matching InventoryTransaction row. The ledger is the truth; StockLevel is a
 * cached projection of it. Anything that mutates one without the other breaks
 * the audit trail and the actual-cost report.
 */
import 'server-only';
import type { Prisma, InventoryTransactionType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { Decimal, d, money, qty } from '@/lib/money';
import { applyMovement, stockStatus, type MovementType } from '@/lib/engine/inventory-engine';

export interface MovementRequest {
  ingredientId: string;
  branchId: string;
  warehouseId: string;
  type: InventoryTransactionType;
  /** Positive for issues (the type decides the direction), signed for ADJUSTMENT. */
  quantity: Decimal | string | number;
  unitCost?: Decimal | string | number | null;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  userId?: string | null;
  occurredAt?: Date;
}

/**
 * Records one stock movement inside an existing transaction.
 *
 * Takes a Prisma transaction client rather than opening its own, because a
 * purchase receipt or a sale must move many ingredients atomically — a partial
 * depletion would leave inventory permanently wrong.
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  req: MovementRequest,
): Promise<{ balanceAfter: Decimal; unitCost: Decimal; totalCost: Decimal }> {
  // Lock-free read-modify-write is safe here because callers hold a DB
  // transaction and Postgres serialises the subsequent upsert on the unique key.
  const existing = await tx.stockLevel.findUnique({
    where: { ingredientId_warehouseId: { ingredientId: req.ingredientId, warehouseId: req.warehouseId } },
  });

  const position = {
    quantity: d(existing?.quantity ?? 0),
    avgUnitCost: d(existing?.avgUnitCost ?? 0),
  };

  const result = applyMovement(position, req.type as MovementType, req.quantity, {
    unitCost: req.unitCost ?? null,
  });

  await tx.stockLevel.upsert({
    where: { ingredientId_warehouseId: { ingredientId: req.ingredientId, warehouseId: req.warehouseId } },
    create: {
      ingredientId: req.ingredientId,
      branchId: req.branchId,
      warehouseId: req.warehouseId,
      quantity: result.position.quantity.toFixed(6),
      avgUnitCost: result.position.avgUnitCost.toFixed(8),
    },
    update: {
      quantity: result.position.quantity.toFixed(6),
      avgUnitCost: result.position.avgUnitCost.toFixed(8),
    },
  });

  await tx.inventoryTransaction.create({
    data: {
      ingredientId: req.ingredientId,
      branchId: req.branchId,
      warehouseId: req.warehouseId,
      type: req.type,
      quantity: result.quantity.toFixed(6),
      unitCost: result.unitCost.toFixed(8),
      totalCost: result.totalCost.toFixed(4),
      balanceAfter: result.position.quantity.toFixed(6),
      referenceType: req.referenceType,
      referenceId: req.referenceId,
      reason: req.reason,
      userId: req.userId ?? undefined,
      occurredAt: req.occurredAt ?? new Date(),
    },
  });

  return {
    balanceAfter: result.position.quantity,
    unitCost: result.unitCost,
    totalCost: result.totalCost,
  };
}

/** Current position for a set of ingredients, aggregated across warehouses. */
export async function getStockPositions(
  restaurantId: string,
  ingredientIds?: string[],
): Promise<Map<string, { quantity: Decimal; avgUnitCost: Decimal }>> {
  const levels = await prisma.stockLevel.findMany({
    where: {
      ingredient: { restaurantId },
      ...(ingredientIds ? { ingredientId: { in: ingredientIds } } : {}),
    },
  });

  const positions = new Map<string, { quantity: Decimal; avgUnitCost: Decimal; value: Decimal }>();
  for (const level of levels) {
    const current = positions.get(level.ingredientId) ?? {
      quantity: d(0), avgUnitCost: d(0), value: d(0),
    };
    const quantity = current.quantity.plus(d(level.quantity));
    const value = current.value.plus(d(level.quantity).times(d(level.avgUnitCost)));
    positions.set(level.ingredientId, {
      quantity,
      // Blend the per-warehouse averages by quantity.
      avgUnitCost: quantity.isZero() ? d(level.avgUnitCost) : value.dividedBy(quantity),
      value,
    });
  }
  return positions;
}

export interface StockAlertRow {
  ingredientId: string;
  name: string;
  namePersian: string;
  quantity: string;
  minimumStock: string;
  reorderLevel: string;
  recipeUnit: string;
  status: ReturnType<typeof stockStatus>;
  value: string;
}

/** Ingredients at or below their thresholds, worst first. */
export async function getStockAlerts(restaurantId: string): Promise<StockAlertRow[]> {
  const ingredients = await prisma.ingredient.findMany({
    where: { restaurantId, isActive: true },
    include: { stockLevels: true },
  });
  const units = await prisma.unitDefinition.findMany({ where: { restaurantId } });
  const unitById = new Map(units.map((u) => [u.id, u.labelPersian]));

  const rows = ingredients.map((ing) => {
    const quantity = ing.stockLevels.reduce<Decimal>((a, s) => a.plus(d(s.quantity)), d(0));
    const value = ing.stockLevels.reduce<Decimal>(
      (a, s) => a.plus(d(s.quantity).times(d(s.avgUnitCost))), d(0),
    );
    return {
      ingredientId: ing.id,
      name: ing.name,
      namePersian: ing.namePersian,
      quantity: qty(quantity).toFixed(),
      minimumStock: ing.minimumStock.toString(),
      reorderLevel: ing.reorderLevel.toString(),
      recipeUnit: unitById.get(ing.recipeUnitId) ?? '',
      status: stockStatus(quantity, ing.minimumStock.toString(), ing.reorderLevel.toString()),
      value: money(value).toFixed(),
    };
  });

  const severity = { OUT_OF_STOCK: 0, CRITICAL: 1, LOW: 2, OK: 3 } as const;
  return rows
    .filter((r) => r.status !== 'OK')
    .sort((a, b) => severity[a.status] - severity[b.status]);
}

/** Total value of everything on hand — the inventory valuation report. */
export async function getInventoryValuation(restaurantId: string): Promise<Decimal> {
  const levels = await prisma.stockLevel.findMany({ where: { ingredient: { restaurantId } } });
  return money(
    levels.reduce<Decimal>((acc, l) => acc.plus(d(l.quantity).times(d(l.avgUnitCost))), d(0)),
  );
}
