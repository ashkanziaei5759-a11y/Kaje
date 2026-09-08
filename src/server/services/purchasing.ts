/**
 * PURCHASE → INVENTORY → COST ENGINE
 *
 * Approving a purchase is the single point where an invoice becomes:
 *   1. stock on hand (at the delivered price),
 *   2. a new weighted-average cost for the ingredient,
 *   3. a price-history entry,
 *   4. a price-increase alert when the jump is material.
 *
 * Everything runs in ONE database transaction. A half-applied invoice — stock
 * received but prices not updated — would silently corrupt every dish costed
 * afterwards, so partial success is not an acceptable outcome.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { Decimal, d, money } from '@/lib/money';
import { normalisePurchaseLine, type UnitDef } from '@/lib/units';
import { recordMovement } from './inventory';
import { writeAudit } from './audit';

export class PurchaseError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'PurchaseError';
  }
}

/** Price jump beyond this fraction raises an alert. Configurable per restaurant. */
const DEFAULT_PRICE_ALERT_THRESHOLD = 0.1;

export async function approvePurchase(args: {
  purchaseId: string;
  restaurantId: string;
  userId: string;
  warehouseId?: string;
}): Promise<{ linesApplied: number; alertsRaised: number }> {
  const { purchaseId, restaurantId, userId } = args;

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findFirst({
      where: { id: purchaseId, restaurantId },
      include: { items: { include: { ingredient: true } }, branch: { include: { warehouses: true } } },
    });

    if (!purchase) throw new PurchaseError('Purchase not found', 'NOT_FOUND');
    if (purchase.status === 'APPROVED') {
      // Idempotence matters: a double-click must not receive the stock twice.
      throw new PurchaseError('This purchase has already been approved', 'ALREADY_APPROVED');
    }
    if (purchase.status === 'CANCELLED') {
      throw new PurchaseError('A cancelled purchase cannot be approved', 'CANCELLED');
    }
    if (purchase.items.length === 0) {
      throw new PurchaseError('A purchase must have at least one line', 'NO_ITEMS');
    }

    const warehouseId =
      args.warehouseId ??
      purchase.branch.warehouses.find((w) => w.isDefault)?.id ??
      purchase.branch.warehouses[0]?.id;
    if (!warehouseId) {
      throw new PurchaseError('The branch has no warehouse to receive stock into', 'NO_WAREHOUSE');
    }

    const units = await tx.unitDefinition.findMany({ where: { restaurantId } });
    const unitById = new Map<string, UnitDef>(
      units.map((u) => [u.id, { code: u.code, dimension: u.dimension, factorToBase: u.factorToBase.toString() }]),
    );

    const thresholdSetting = await tx.setting.findUnique({
      where: { restaurantId_key: { restaurantId, key: 'alerts.priceIncreaseThreshold' } },
    });
    const threshold = thresholdSetting
      ? d(String(thresholdSetting.value))
      : d(DEFAULT_PRICE_ALERT_THRESHOLD);

    let alertsRaised = 0;

    for (const line of purchase.items) {
      const ingredient = line.ingredient;
      const invoiceUnit = unitById.get(line.unitId);
      const purchaseUnit = unitById.get(ingredient.purchaseUnitId);
      if (!invoiceUnit || !purchaseUnit) {
        throw new PurchaseError(
          `Unit definition missing for ingredient ${ingredient.name}`,
          'UNIT_NOT_FOUND',
        );
      }

      // Net of discount and tax: what the stock actually cost us.
      const netLineTotal = d(line.lineTotal);
      const effectiveUnitPrice = d(line.quantity).isZero()
        ? d(0)
        : netLineTotal.dividedBy(d(line.quantity));

      const normalised = normalisePurchaseLine({
        quantity: line.quantity.toString(),
        invoiceUnit,
        unitPrice: effectiveUnitPrice,
        config: {
          purchaseUnit,
          recipeUnit: unitById.get(ingredient.recipeUnitId)!,
          conversionFactor: ingredient.conversionFactor.toString(),
        },
      });

      if (normalised.recipeQuantity.lessThanOrEqualTo(0)) {
        throw new PurchaseError(
          `Line for ${ingredient.name} normalises to a non-positive quantity`,
          'INVALID_QUANTITY',
        );
      }

      // 1. Stock in, at the delivered cost per recipe unit.
      await recordMovement(tx, {
        ingredientId: ingredient.id,
        branchId: purchase.branchId,
        warehouseId,
        type: 'PURCHASE_RECEIPT',
        quantity: normalised.recipeQuantity,
        unitCost: normalised.costPerRecipeUnit,
        referenceType: 'Purchase',
        referenceId: purchase.id,
        reason: `فاکتور ${purchase.invoiceNumber ?? purchase.id.slice(-6)}`,
        userId,
        occurredAt: purchase.purchaseDate,
      });

      // 2. New price per PURCHASE unit, and the moving average that follows.
      const newPurchaseUnitPrice = money(
        normalised.costPerRecipeUnit.times(d(ingredient.conversionFactor)),
      );
      const previousPrice = d(ingredient.lastPurchasePrice);

      // The ingredient's average is recomputed from the stock ledger rather than
      // kept as a separate running figure, so the two can never drift apart.
      const level = await tx.stockLevel.findUnique({
        where: { ingredientId_warehouseId: { ingredientId: ingredient.id, warehouseId } },
      });
      const newAveragePurchasePrice = level
        ? money(d(level.avgUnitCost).times(d(ingredient.conversionFactor)))
        : newPurchaseUnitPrice;

      await tx.ingredient.update({
        where: { id: ingredient.id },
        data: {
          lastPurchasePrice: newPurchaseUnitPrice.toFixed(4),
          averagePrice: newAveragePurchasePrice.toFixed(4),
          lastPurchaseDate: purchase.purchaseDate,
        },
      });

      // 3. Price history — append-only, drives the chart and the alerts.
      const changePercent = previousPrice.isZero()
        ? null
        : newPurchaseUnitPrice.minus(previousPrice).dividedBy(previousPrice);

      await tx.ingredientPriceHistory.create({
        data: {
          ingredientId: ingredient.id,
          supplierId: purchase.supplierId,
          price: newPurchaseUnitPrice.toFixed(4),
          previousPrice: previousPrice.isZero() ? null : previousPrice.toFixed(4),
          changePercent: changePercent ? changePercent.toDecimalPlaces(6).toFixed() : null,
          source: 'PURCHASE',
          referenceId: purchase.id,
          effectiveAt: purchase.purchaseDate,
        },
      });

      // 4. Alert on a material increase — this is what makes recipe costs
      //    visibly move rather than drifting unnoticed.
      if (changePercent && changePercent.greaterThan(threshold)) {
        alertsRaised += 1;
        const pct = changePercent.times(100).toDecimalPlaces(1).toFixed();
        await tx.alert.create({
          data: {
            restaurantId,
            type: 'INGREDIENT_PRICE_INCREASE',
            severity: changePercent.greaterThan(0.25) ? 'CRITICAL' : 'WARNING',
            title: `افزایش قیمت ${ingredient.namePersian}`,
            message:
              `قیمت ${ingredient.namePersian} ${pct}٪ افزایش یافت: ` +
              `از ${previousPrice.toFixed(0)} به ${newPurchaseUnitPrice.toFixed(0)}. ` +
              `قیمت تمام‌شده غذاهای وابسته را بررسی کنید.`,
            entityType: 'Ingredient',
            entityId: ingredient.id,
            payload: {
              previousPrice: previousPrice.toFixed(4),
              newPrice: newPurchaseUnitPrice.toFixed(4),
              changePercent: changePercent.toFixed(6),
            },
          },
        });
      }
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });

    await writeAudit(tx, {
      restaurantId,
      userId,
      entityType: 'Purchase',
      entityId: purchase.id,
      action: 'APPROVE',
      after: { status: 'APPROVED', totalAmount: purchase.totalAmount.toString() },
    });

    return { linesApplied: purchase.items.length, alertsRaised };
  }, { timeout: 30_000 });
}

/** Recomputes a purchase's totals from its lines. Called on every edit. */
export function computePurchaseTotals(
  lines: Array<{ quantity: Decimal | string | number; unitPrice: Decimal | string | number; discountAmount?: Decimal | string | number; taxAmount?: Decimal | string | number }>,
): { subtotal: Decimal; discountAmount: Decimal; taxAmount: Decimal; totalAmount: Decimal; lineTotals: Decimal[] } {
  let subtotal = d(0);
  let discountTotal = d(0);
  let taxTotal = d(0);
  const lineTotals: Decimal[] = [];

  for (const line of lines) {
    const gross = d(line.quantity).times(d(line.unitPrice));
    const discount = d(line.discountAmount ?? 0);
    const tax = d(line.taxAmount ?? 0);
    const net = gross.minus(discount).plus(tax);

    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(tax);
    lineTotals.push(money(net));
  }

  return {
    subtotal: money(subtotal),
    discountAmount: money(discountTotal),
    taxAmount: money(taxTotal),
    totalAmount: money(subtotal.minus(discountTotal).plus(taxTotal)),
    lineTotals,
  };
}
