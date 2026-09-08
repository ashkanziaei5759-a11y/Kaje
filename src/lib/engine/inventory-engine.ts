/**
 * INVENTORY ENGINE
 *
 * Pure stock arithmetic — no database access, so every edge case below is
 * unit-tested. The persistence wrapper lives in src/server/services/inventory.ts.
 *
 * Valuation is WEIGHTED MOVING AVERAGE:
 *   - Receipts blend the new price into the average.
 *   - Issues leave at the current average and do NOT move it.
 * This matches how a restaurant actually thinks about "what is my chicken
 * worth", and keeps a single unit cost per ingredient rather than FIFO layers.
 *
 * All quantities here are in the ingredient's RECIPE unit (g / ml / piece).
 */
import { Decimal, d, money, qty, safeDivide, ZERO } from '../money';
import type { Numericish } from './types';

export type MovementType =
  | 'PURCHASE_RECEIPT'
  | 'SALE_DEPLETION'
  | 'SALE_REVERSAL'
  | 'WASTE'
  | 'ADJUSTMENT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'COUNT_CORRECTION'
  | 'PRODUCTION_IN'
  | 'PRODUCTION_OUT';

export interface StockPosition {
  quantity: Decimal;
  avgUnitCost: Decimal;
}

export interface MovementResult {
  /** Signed quantity applied. */
  quantity: Decimal;
  /** Unit cost this movement was valued at. */
  unitCost: Decimal;
  /** Signed value of the movement. */
  totalCost: Decimal;
  position: StockPosition;
  /** True when the issue drove stock negative (allowed, but flagged). */
  wentNegative: boolean;
}

export class InventoryError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'InventoryError';
  }
}

const RECEIPT_TYPES: ReadonlySet<MovementType> = new Set([
  'PURCHASE_RECEIPT',
  'SALE_REVERSAL',
  'TRANSFER_IN',
  'PRODUCTION_IN',
]);

export function isReceipt(type: MovementType): boolean {
  return RECEIPT_TYPES.has(type);
}

/**
 * Applies a stock receipt, blending its price into the moving average.
 *
 *   new_avg = (qty_on_hand × old_avg + qty_in × price_in) / (qty_on_hand + qty_in)
 *
 * When stock is negative (sold more than was recorded as received — a real and
 * common situation before the first stock count), blending would produce a
 * nonsense average, so the incoming price simply becomes the new average.
 */
export function applyReceipt(
  position: StockPosition,
  quantity: Numericish,
  unitCost: Numericish,
): MovementResult {
  const inQty = d(quantity);
  if (inQty.lessThanOrEqualTo(0)) {
    throw new InventoryError(
      `A receipt must have a positive quantity, got ${inQty.toFixed()}`,
      'INVALID_RECEIPT_QTY',
    );
  }
  const inCost = d(unitCost);
  if (inCost.lessThan(0)) {
    throw new InventoryError(`Unit cost cannot be negative: ${inCost.toFixed()}`, 'NEGATIVE_COST');
  }

  const newQuantity = position.quantity.plus(inQty);
  let newAvg: Decimal;

  if (position.quantity.lessThanOrEqualTo(0) || newQuantity.lessThanOrEqualTo(0)) {
    newAvg = inCost;
  } else {
    const existingValue = position.quantity.times(position.avgUnitCost);
    const incomingValue = inQty.times(inCost);
    newAvg = existingValue.plus(incomingValue).dividedBy(newQuantity);
  }

  return {
    quantity: qty(inQty),
    unitCost: inCost,
    totalCost: money(inQty.times(inCost)),
    position: { quantity: qty(newQuantity), avgUnitCost: newAvg },
    wentNegative: false,
  };
}

/**
 * Applies a stock issue at the current average cost.
 *
 * Issues are permitted to drive stock negative rather than throwing: a kitchen
 * that sells a dish before the delivery was keyed in must still be able to
 * record the sale. The negative balance surfaces as an alert and is corrected
 * by the next stock count.
 */
export function applyIssue(
  position: StockPosition,
  quantity: Numericish,
  options: { unitCostOverride?: Numericish | null } = {},
): MovementResult {
  const outQty = d(quantity);
  if (outQty.lessThanOrEqualTo(0)) {
    throw new InventoryError(
      `An issue must have a positive quantity, got ${outQty.toFixed()}`,
      'INVALID_ISSUE_QTY',
    );
  }

  const unitCost =
    options.unitCostOverride !== null && options.unitCostOverride !== undefined
      ? d(options.unitCostOverride)
      : position.avgUnitCost;

  const newQuantity = position.quantity.minus(outQty);

  return {
    quantity: qty(outQty.negated()),
    unitCost,
    totalCost: money(outQty.times(unitCost).negated()),
    // Issuing stock never moves the average cost.
    position: { quantity: qty(newQuantity), avgUnitCost: position.avgUnitCost },
    wentNegative: newQuantity.lessThan(0) && !position.quantity.lessThan(0),
  };
}

/**
 * Sets stock to an absolute counted figure (stock take).
 * The difference is booked at the current average cost, and the average itself
 * is preserved — a count corrects quantity, not valuation.
 */
export function applyCount(position: StockPosition, countedQuantity: Numericish): MovementResult {
  const counted = d(countedQuantity);
  if (counted.lessThan(0)) {
    throw new InventoryError(
      `A physical count cannot be negative, got ${counted.toFixed()}`,
      'NEGATIVE_COUNT',
    );
  }
  const delta = counted.minus(position.quantity);
  return {
    quantity: qty(delta),
    unitCost: position.avgUnitCost,
    totalCost: money(delta.times(position.avgUnitCost)),
    position: { quantity: qty(counted), avgUnitCost: position.avgUnitCost },
    wentNegative: false,
  };
}

/** Dispatches to the right routine for a movement type. */
export function applyMovement(
  position: StockPosition,
  type: MovementType,
  quantity: Numericish,
  options: { unitCost?: Numericish | null } = {},
): MovementResult {
  if (type === 'COUNT_CORRECTION') return applyCount(position, quantity);
  if (isReceipt(type)) {
    const cost = options.unitCost ?? position.avgUnitCost;
    return applyReceipt(position, quantity, cost);
  }
  if (type === 'ADJUSTMENT') {
    // Adjustments are signed: positive tops up, negative writes off.
    const delta = d(quantity);
    if (delta.isZero()) {
      throw new InventoryError('An adjustment of zero has no effect', 'ZERO_ADJUSTMENT');
    }
    return delta.greaterThan(0)
      ? applyReceipt(position, delta, options.unitCost ?? position.avgUnitCost)
      : applyIssue(position, delta.negated(), { unitCostOverride: options.unitCost });
  }
  return applyIssue(position, quantity, { unitCostOverride: options.unitCost });
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe explosion — what a sale actually consumes
// ─────────────────────────────────────────────────────────────────────────────

export interface DepletionLine {
  ingredientId: string;
  /** Positive quantity to remove, in the ingredient's recipe unit. */
  quantity: Decimal;
}

/**
 * Merges duplicate ingredient lines so a dish using tomato twice produces one
 * stock movement, not two competing ones.
 */
export function mergeDepletion(lines: DepletionLine[]): DepletionLine[] {
  const merged = new Map<string, Decimal>();
  for (const line of lines) {
    const current = merged.get(line.ingredientId) ?? ZERO;
    merged.set(line.ingredientId, current.plus(line.quantity));
  }
  return [...merged.entries()]
    .filter(([, quantity]) => !quantity.isZero())
    .map(([ingredientId, quantity]) => ({ ingredientId, quantity: qty(quantity) }));
}

/** Total value of a set of positions — the inventory valuation report. */
export function valuation(positions: Array<StockPosition>): Decimal {
  return money(
    positions.reduce<Decimal>((acc, p) => acc.plus(p.quantity.times(p.avgUnitCost)), ZERO),
  );
}

export type StockStatus = 'OUT_OF_STOCK' | 'CRITICAL' | 'LOW' | 'OK';

/**
 * Classifies a position against its thresholds.
 * Reorder level is the "order now" line; minimum stock is the "you are about to
 * run out" line. Minimum is checked first because it is the more severe.
 */
export function stockStatus(
  quantity: Numericish,
  minimumStock: Numericish,
  reorderLevel: Numericish,
): StockStatus {
  const q = d(quantity);
  if (q.lessThanOrEqualTo(0)) return 'OUT_OF_STOCK';
  if (q.lessThanOrEqualTo(d(minimumStock))) return 'CRITICAL';
  if (q.lessThanOrEqualTo(d(reorderLevel))) return 'LOW';
  return 'OK';
}

/**
 * How many portions of a recipe the current stock can still produce.
 * The answer is the binding constraint — the scarcest ingredient.
 */
export function portionsAvailable(
  requirements: Array<{ ingredientId: string; quantityPerPortion: Decimal }>,
  onHand: Map<string, Decimal>,
): number {
  if (requirements.length === 0) return Number.POSITIVE_INFINITY;
  let limit = Number.POSITIVE_INFINITY;
  for (const req of requirements) {
    if (req.quantityPerPortion.lessThanOrEqualTo(0)) continue;
    const available = onHand.get(req.ingredientId) ?? ZERO;
    const possible = safeDivide(available, req.quantityPerPortion, 0).floor().toNumber();
    limit = Math.min(limit, Math.max(0, possible));
  }
  return limit;
}
