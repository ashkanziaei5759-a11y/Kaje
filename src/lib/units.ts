/**
 * Unit conversion.
 *
 * Two independent conversions exist in this system and confusing them is the
 * classic source of 1000× costing bugs:
 *
 *  1. DIMENSIONAL conversion — kg↔g, l↔ml. Pure physics, driven by
 *     UnitDefinition.factorToBase. Works for any two units of the same dimension.
 *
 *  2. PACKAGING conversion — "1 box = 24 pieces", "1 package = 700 g". This is a
 *     property of the *ingredient*, not of the units, and lives in
 *     Ingredient.conversionFactor (recipe units per ONE purchase unit).
 *
 * Everything internal is normalised to the ingredient's RECIPE unit so that
 * inventory, recipes and costing all speak one language.
 */
import { Decimal, d, safeDivide } from './money';

export type UnitDimension = 'MASS' | 'VOLUME' | 'COUNT';

export interface UnitDef {
  code: string;
  dimension: UnitDimension;
  /** How many base units (g / ml / piece) one of this unit contains. */
  factorToBase: Decimal | string | number;
}

/** Seed defaults. A restaurant may add or override these as data. */
export const DEFAULT_UNITS: ReadonlyArray<UnitDef & { labelPersian: string }> = [
  { code: 'g', labelPersian: 'گرم', dimension: 'MASS', factorToBase: 1 },
  { code: 'kg', labelPersian: 'کیلوگرم', dimension: 'MASS', factorToBase: 1000 },
  { code: 'mg', labelPersian: 'میلی‌گرم', dimension: 'MASS', factorToBase: 0.001 },
  { code: 'ml', labelPersian: 'میلی‌لیتر', dimension: 'VOLUME', factorToBase: 1 },
  { code: 'l', labelPersian: 'لیتر', dimension: 'VOLUME', factorToBase: 1000 },
  { code: 'piece', labelPersian: 'عدد', dimension: 'COUNT', factorToBase: 1 },
  { code: 'package', labelPersian: 'بسته', dimension: 'COUNT', factorToBase: 1 },
  { code: 'box', labelPersian: 'کارتن', dimension: 'COUNT', factorToBase: 1 },
  { code: 'portion', labelPersian: 'پرس', dimension: 'COUNT', factorToBase: 1 },
];

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

/**
 * Converts a quantity between two units of the SAME dimension.
 * Cross-dimension conversion (g → ml) is refused: it needs a density that this
 * system does not model, and guessing would silently corrupt costs.
 */
export function convert(quantity: Decimal | string | number, from: UnitDef, to: UnitDef): Decimal {
  if (from.dimension !== to.dimension) {
    throw new UnitConversionError(
      `Cannot convert ${from.code} (${from.dimension}) to ${to.code} (${to.dimension}). ` +
        `Use the ingredient's conversionFactor for packaging-style conversions.`,
    );
  }
  const inBase = d(quantity).times(d(from.factorToBase));
  return safeDivide(inBase, d(to.factorToBase), 0);
}

export interface IngredientUnitConfig {
  /** Unit the ingredient is purchased in. */
  purchaseUnit: UnitDef;
  /** Unit recipes consume it in. */
  recipeUnit: UnitDef;
  /** Recipe units contained in ONE purchase unit. */
  conversionFactor: Decimal | string | number;
}

/**
 * Cost of ONE recipe unit, given the price of one purchase unit.
 *
 *   10 kg chicken for 8,500,000  →  purchaseUnitPrice = 850,000 per kg
 *   conversionFactor = 1000 (g per kg)
 *   ⇒ 850 per gram
 */
export function costPerRecipeUnit(
  purchaseUnitPrice: Decimal | string | number,
  conversionFactor: Decimal | string | number,
): Decimal {
  const factor = d(conversionFactor);
  if (factor.lessThanOrEqualTo(0)) {
    throw new UnitConversionError(
      `conversionFactor must be greater than zero, received ${factor.toFixed()}`,
    );
  }
  return d(purchaseUnitPrice).dividedBy(factor);
}

/** Recipe units contained in `quantity` purchase units. */
export function purchaseToRecipeQty(
  quantity: Decimal | string | number,
  conversionFactor: Decimal | string | number,
): Decimal {
  return d(quantity).times(d(conversionFactor));
}

/** Inverse of the above — used when displaying stock in purchase units. */
export function recipeToPurchaseQty(
  quantity: Decimal | string | number,
  conversionFactor: Decimal | string | number,
): Decimal {
  return safeDivide(quantity, conversionFactor, 0);
}

/**
 * Normalises a purchase line into the ingredient's recipe unit.
 *
 * Handles the common case where the invoice is written in a unit that differs
 * from the ingredient's configured purchase unit (bought in `g`, configured in
 * `kg`): the dimensional conversion runs first, then the packaging factor.
 */
export function normalisePurchaseLine(
  args: {
    quantity: Decimal | string | number;
    /** Unit as written on the invoice. */
    invoiceUnit: UnitDef;
    /** Price of one `invoiceUnit`. */
    unitPrice: Decimal | string | number;
    config: IngredientUnitConfig;
  },
): { recipeQuantity: Decimal; costPerRecipeUnit: Decimal; totalCost: Decimal } {
  const { quantity, invoiceUnit, unitPrice, config } = args;
  const totalCost = d(quantity).times(d(unitPrice));

  let purchaseUnitQty: Decimal;
  if (invoiceUnit.code === config.purchaseUnit.code) {
    purchaseUnitQty = d(quantity);
  } else if (invoiceUnit.dimension === config.purchaseUnit.dimension) {
    purchaseUnitQty = convert(quantity, invoiceUnit, config.purchaseUnit);
  } else {
    throw new UnitConversionError(
      `Invoice unit ${invoiceUnit.code} is not compatible with the ingredient's ` +
        `purchase unit ${config.purchaseUnit.code}.`,
    );
  }

  const recipeQuantity = purchaseToRecipeQty(purchaseUnitQty, config.conversionFactor);
  return {
    recipeQuantity,
    costPerRecipeUnit: safeDivide(totalCost, recipeQuantity, 0),
    totalCost,
  };
}

/**
 * Yield-adjusted cost per USABLE recipe unit.
 *
 * Buying 10 kg of meat that cleans down to 8 kg means the 8 kg you actually
 * cook with carries the full 10 kg price. Costing at the raw price understates
 * every dish built from it.
 */
export function applyYield(
  costPerUnit: Decimal | string | number,
  yieldPercent: Decimal | string | number,
): Decimal {
  const y = d(yieldPercent);
  if (y.lessThanOrEqualTo(0) || y.greaterThan(1)) {
    throw new UnitConversionError(
      `yieldPercent must be a fraction in (0, 1], received ${y.toFixed()}`,
    );
  }
  return d(costPerUnit).dividedBy(y);
}

/** Raw quantity you must start from to end up with `usableQuantity`. */
export function grossUpForYield(
  usableQuantity: Decimal | string | number,
  yieldPercent: Decimal | string | number,
): Decimal {
  const y = d(yieldPercent);
  if (y.lessThanOrEqualTo(0) || y.greaterThan(1)) {
    throw new UnitConversionError(
      `yieldPercent must be a fraction in (0, 1], received ${y.toFixed()}`,
    );
  }
  return d(usableQuantity).dividedBy(y);
}

export function findUnit(units: readonly UnitDef[], code: string): UnitDef {
  const unit = units.find((u) => u.code === code);
  if (!unit) throw new UnitConversionError(`Unknown unit code: ${code}`);
  return unit;
}
