/**
 * THE COST ENGINE
 *
 * Answers, for any menu item:
 *   «این غذا دقیقاً چقدر برای کاژه تمام می‌شود، چند درصد سود دارد،
 *    چرا این‌قدر هزینه دارد، و قیمت فروش پیشنهادی آن چقدر است؟»
 *
 * The pipeline:
 *
 *   ingredient_cost            (yield-adjusted, recursive through sub-recipes)
 * + sub_recipe_cost
 * + packaging_cost
 * + direct_labor_cost          (configurable method)
 * + allocated_overhead         (configurable method)
 * = total_cost
 *
 *   selling_price - total_cost = gross_profit
 *   gross_profit / selling_price = gross_margin_pct
 *   ingredient_cost / selling_price = food_cost_pct
 *
 * Design rules honoured here:
 *  - Not one business assumption is hard-coded; all of them arrive on the
 *    CostingProfile.
 *  - Every intermediate is a Decimal. Rounding happens once, at the edge.
 *  - Every number produced is accompanied by the formula that produced it,
 *    so the admin screen can show its work.
 */
import { Decimal, d, money, percent, safeDivide, ratio, ZERO } from '../money';
import { applyYield, grossUpForYield, convert } from '../units';
import type {
  CostLine,
  EngineContext,
  EngineCostingProfile,
  EngineMenuItem,
  EngineRecipe,
  EngineRecipeItem,
  EngineUnit,
  FormulaTrace,
  MenuItemCostResult,
  Numericish,
  RecipeCostResult,
} from './types';

export class CostEngineError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'CostEngineError';
  }
}

/** Guards against a sub-recipe graph that references itself. */
const MAX_RECIPE_DEPTH = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Recipe costing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Costs ONE PORTION of a recipe, recursing into sub-recipes.
 *
 * `visiting` carries the current DFS path so a cycle (A → B → A) is reported
 * with the exact chain rather than blowing the stack.
 */
export function costRecipe(
  recipeId: string,
  ctx: EngineContext,
  options: { depth?: number; visiting?: string[]; scale?: Numericish } = {},
): RecipeCostResult {
  const depth = options.depth ?? 0;
  const visiting = options.visiting ?? [];
  const scale = d(options.scale ?? 1);

  const recipe = ctx.recipes.get(recipeId);
  if (!recipe) {
    throw new CostEngineError(`Recipe not found: ${recipeId}`, 'RECIPE_NOT_FOUND');
  }
  if (visiting.includes(recipeId)) {
    throw new CostEngineError(
      `Circular sub-recipe reference: ${[...visiting, recipeId].join(' → ')}`,
      'CIRCULAR_RECIPE',
    );
  }
  if (depth > MAX_RECIPE_DEPTH) {
    throw new CostEngineError(
      `Sub-recipe nesting exceeded ${MAX_RECIPE_DEPTH} levels at ${recipe.name}`,
      'RECIPE_TOO_DEEP',
    );
  }

  const path = [...visiting, recipeId];

  let ingredientCost = ZERO;
  let subRecipeCost = ZERO;
  let packagingCost = ZERO;
  let wasteAdjustment = ZERO;
  let laborMinutes = recipe.prepTimeMinutes + recipe.cookTimeMinutes;
  const lines: CostLine[] = [];

  for (const item of recipe.items) {
    if (item.isOptional) continue;

    if (item.ingredientId) {
      const line = costIngredientLine(item, ctx);
      lines.push(line);
      wasteAdjustment = wasteAdjustment.plus(d(line.wasteCost));
      if (line.isPackaging) {
        packagingCost = packagingCost.plus(d(line.totalCost));
      } else {
        ingredientCost = ingredientCost.plus(d(line.totalCost));
      }
    } else if (item.subRecipeId) {
      const line = costSubRecipeLine(item, ctx, depth + 1, path);
      lines.push(line);
      subRecipeCost = subRecipeCost.plus(d(line.totalCost));
      wasteAdjustment = wasteAdjustment.plus(d(line.wasteCost));
      const nested = ctx.recipes.get(item.subRecipeId);
      if (nested) {
        // Sub-recipe prep time counts toward the finished dish's labor.
        laborMinutes += nested.prepTimeMinutes + nested.cookTimeMinutes;
      }
    } else {
      throw new CostEngineError(
        `Recipe item ${item.id} references neither an ingredient nor a sub-recipe`,
        'INVALID_RECIPE_ITEM',
      );
    }
  }

  // Cooking loss and preparation loss shrink the output, so the same input cost
  // is spread over fewer usable portions.
  const survivingFraction = d(recipe.recipeYieldPercent).times(
    new Decimal(1).minus(d(recipe.preparationLossPercent)),
  );
  if (survivingFraction.lessThanOrEqualTo(0) || survivingFraction.greaterThan(1)) {
    throw new CostEngineError(
      `Recipe ${recipe.name} has an impossible effective yield of ` +
        `${survivingFraction.toFixed()}; recipeYieldPercent must be in (0,1] and ` +
        `preparationLossPercent in [0,1).`,
      'INVALID_RECIPE_YIELD',
    );
  }

  const grossCost = ingredientCost.plus(subRecipeCost).plus(packagingCost);
  const costAfterLoss = grossCost.dividedBy(survivingFraction);
  wasteAdjustment = wasteAdjustment.plus(costAfterLoss.minus(grossCost));

  // Spread over the portions one execution yields.
  const yieldQty = d(recipe.yieldQuantity);
  if (yieldQty.lessThanOrEqualTo(0)) {
    throw new CostEngineError(
      `Recipe ${recipe.name} must yield a positive quantity, got ${yieldQty.toFixed()}`,
      'INVALID_RECIPE_YIELD_QTY',
    );
  }

  const perPortion = (v: Decimal) => v.dividedBy(survivingFraction).dividedBy(yieldQty).times(scale);

  return {
    recipeId,
    ingredientCost: money(perPortion(ingredientCost)).toFixed(),
    subRecipeCost: money(perPortion(subRecipeCost)).toFixed(),
    packagingCost: money(perPortion(packagingCost)).toFixed(),
    wasteAdjustment: money(wasteAdjustment.dividedBy(yieldQty).times(scale)).toFixed(),
    totalCost: money(perPortion(grossCost)).toFixed(),
    laborMinutes,
    lines,
  };
}

/** Costs a single ingredient line of a BOM. */
function costIngredientLine(item: EngineRecipeItem, ctx: EngineContext): CostLine {
  const ingredient = ctx.ingredients.get(item.ingredientId!);
  if (!ingredient) {
    throw new CostEngineError(
      `Ingredient not found: ${item.ingredientId}`,
      'INGREDIENT_NOT_FOUND',
    );
  }

  const recipeUnit = requireUnit(ctx, ingredient.recipeUnitId, ingredient.name);
  const lineUnit = requireUnit(ctx, item.unitId, ingredient.name);

  // The BOM may be written in kg while the ingredient is stocked in g.
  const quantityInRecipeUnits =
    lineUnit.code === recipeUnit.code
      ? d(item.quantity)
      : convert(d(item.quantity), lineUnit, recipeUnit);

  // Cost of one recipe unit at the raw purchase price.
  const factor = d(ingredient.conversionFactor);
  if (factor.lessThanOrEqualTo(0)) {
    throw new CostEngineError(
      `Ingredient ${ingredient.name} has a non-positive conversionFactor`,
      'INVALID_CONVERSION_FACTOR',
    );
  }
  const baseUnitCost = d(ingredient.purchaseUnitPrice).dividedBy(factor);

  // Yield: line override wins over the ingredient default.
  const yieldPercent = d(item.yieldPercentOverride ?? ingredient.yieldPercent);
  const effectiveUnitCost = applyYield(baseUnitCost, yieldPercent);

  // Line-level waste is an additional quantity uplift (trimmings, spillage).
  const wastePercent = d(item.wastePercent ?? 0);
  if (wastePercent.lessThan(0) || wastePercent.greaterThanOrEqualTo(1)) {
    throw new CostEngineError(
      `wastePercent on line ${item.id} must be in [0,1), got ${wastePercent.toFixed()}`,
      'INVALID_WASTE_PERCENT',
    );
  }
  const effectiveQuantity = grossUpForYield(
    quantityInRecipeUnits,
    new Decimal(1).minus(wastePercent),
  );

  const totalCost = effectiveQuantity.times(effectiveUnitCost);
  const idealCost = quantityInRecipeUnits.times(baseUnitCost);

  return {
    kind: 'INGREDIENT',
    refId: ingredient.id,
    name: ingredient.name,
    namePersian: ingredient.namePersian,
    quantity: d(item.quantity).toFixed(),
    unitCode: lineUnit.code,
    effectiveQuantity: effectiveQuantity.toFixed(6),
    baseUnitCost: baseUnitCost.toFixed(8),
    effectiveUnitCost: effectiveUnitCost.toFixed(8),
    totalCost: money(totalCost).toFixed(),
    wasteCost: money(totalCost.minus(idealCost)).toFixed(),
    isPackaging: ingredient.isPackaging,
  };
}

/** Costs a nested sub-recipe line. */
function costSubRecipeLine(
  item: EngineRecipeItem,
  ctx: EngineContext,
  depth: number,
  visiting: string[],
): CostLine {
  const sub = ctx.recipes.get(item.subRecipeId!);
  if (!sub) {
    throw new CostEngineError(`Sub-recipe not found: ${item.subRecipeId}`, 'RECIPE_NOT_FOUND');
  }

  // Cost of ONE yield unit of the sub-recipe.
  const subResult = costRecipe(sub.id, ctx, { depth, visiting });
  const unitCost = d(subResult.totalCost);

  // Quantity of the sub-recipe consumed, expressed in its yield unit.
  const lineUnit = requireUnit(ctx, item.unitId, sub.name);
  let quantity = d(item.quantity);
  if (sub.yieldUnitId) {
    const yieldUnit = requireUnit(ctx, sub.yieldUnitId, sub.name);
    if (lineUnit.code !== yieldUnit.code) {
      quantity = convert(quantity, lineUnit, yieldUnit);
    }
  }

  const wastePercent = d(item.wastePercent ?? 0);
  const effectiveQuantity = grossUpForYield(quantity, new Decimal(1).minus(wastePercent));
  const totalCost = effectiveQuantity.times(unitCost);
  const idealCost = quantity.times(unitCost);

  return {
    kind: 'SUB_RECIPE',
    refId: sub.id,
    name: sub.name,
    namePersian: sub.namePersian,
    quantity: d(item.quantity).toFixed(),
    unitCode: lineUnit.code,
    effectiveQuantity: effectiveQuantity.toFixed(6),
    baseUnitCost: unitCost.toFixed(8),
    effectiveUnitCost: unitCost.toFixed(8),
    totalCost: money(totalCost).toFixed(),
    wasteCost: money(totalCost.minus(idealCost).plus(d(subResult.wasteAdjustment).times(quantity))).toFixed(),
    isPackaging: false,
    children: subResult.lines,
  };
}

function requireUnit(ctx: EngineContext, unitId: string, forWhat: string): EngineUnit {
  const unit = ctx.units.get(unitId);
  if (!unit) {
    throw new CostEngineError(`Unit ${unitId} not found (referenced by ${forWhat})`, 'UNIT_NOT_FOUND');
  }
  return unit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labor & overhead allocation
// ─────────────────────────────────────────────────────────────────────────────

export function calculateLaborCost(
  profile: EngineCostingProfile,
  laborMinutes: number,
  sellingPrice: Decimal,
): { cost: Decimal; formula: FormulaTrace } {
  switch (profile.laborMethod) {
    case 'PER_MINUTE': {
      const rate = d(profile.laborCostPerMinute);
      const cost = rate.times(laborMinutes);
      return {
        cost,
        formula: trace(
          'Direct labor',
          'هزینه مستقیم نیروی کار',
          'labor_minutes × cost_per_minute',
          `${laborMinutes} × ${rate.toFixed()}`,
          cost,
        ),
      };
    }
    case 'PERCENT_OF_REVENUE': {
      const pct = d(profile.laborPercentOfRevenue);
      const cost = sellingPrice.times(pct);
      return {
        cost,
        formula: trace(
          'Allocated labor',
          'نیروی کار تخصیص‌یافته',
          'selling_price × labor_percent',
          `${sellingPrice.toFixed()} × ${pct.toFixed()}`,
          cost,
        ),
      };
    }
    case 'PER_UNIT': {
      const units = Math.max(1, profile.expectedMonthlyUnits);
      const cost = d(profile.monthlyLaborCost).dividedBy(units);
      return {
        cost,
        formula: trace(
          'Allocated labor',
          'نیروی کار تخصیص‌یافته',
          'monthly_labor_cost / expected_monthly_units',
          `${d(profile.monthlyLaborCost).toFixed()} / ${units}`,
          cost,
        ),
      };
    }
    case 'NONE':
    default:
      return {
        cost: ZERO,
        formula: trace('Direct labor', 'هزینه مستقیم نیروی کار', 'disabled', '—', ZERO),
      };
  }
}

export function calculateOverheadCost(
  profile: EngineCostingProfile,
  args: { sellingPrice: Decimal; foodCost: Decimal; laborMinutes: number; override?: Numericish | null },
): { cost: Decimal; formula: FormulaTrace } {
  const { sellingPrice, foodCost, laborMinutes, override } = args;

  if (override !== null && override !== undefined) {
    const cost = d(override);
    return {
      cost,
      formula: trace('Overhead', 'سربار', 'manual override', cost.toFixed(), cost),
    };
  }

  switch (profile.overheadMethod) {
    case 'PER_UNIT': {
      const units = Math.max(1, profile.expectedMonthlyUnits);
      const cost = d(profile.monthlyOverheadCost).dividedBy(units);
      return {
        cost,
        formula: trace(
          'Allocated overhead',
          'سربار تخصیص‌یافته',
          'monthly_overhead / expected_monthly_units',
          `${d(profile.monthlyOverheadCost).toFixed()} / ${units}`,
          cost,
        ),
      };
    }
    case 'PERCENT_OF_REVENUE': {
      const pct = d(profile.overheadPercentOfRevenue);
      const cost = sellingPrice.times(pct);
      return {
        cost,
        formula: trace(
          'Allocated overhead',
          'سربار تخصیص‌یافته',
          'selling_price × overhead_percent',
          `${sellingPrice.toFixed()} × ${pct.toFixed()}`,
          cost,
        ),
      };
    }
    case 'PERCENT_OF_FOOD_COST': {
      const pct = d(profile.overheadPercentOfFoodCost);
      const cost = foodCost.times(pct);
      return {
        cost,
        formula: trace(
          'Allocated overhead',
          'سربار تخصیص‌یافته',
          'ingredient_cost × overhead_percent',
          `${foodCost.toFixed()} × ${pct.toFixed()}`,
          cost,
        ),
      };
    }
    case 'PER_LABOR_MINUTE': {
      const rate = d(profile.overheadPerLaborMinute);
      const cost = rate.times(laborMinutes);
      return {
        cost,
        formula: trace(
          'Allocated overhead',
          'سربار تخصیص‌یافته',
          'labor_minutes × overhead_rate_per_minute',
          `${laborMinutes} × ${rate.toFixed()}`,
          cost,
        ),
      };
    }
    case 'NONE':
    default:
      return { cost: ZERO, formula: trace('Overhead', 'سربار', 'disabled', '—', ZERO) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommended selling price
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applies the restaurant's rounding rule to a raw recommended price.
 * Rounding is always UP: rounding a recommendation down would silently drop the
 * item below its target margin.
 */
export function applyRounding(value: Decimal, rule: RoundingRuleName): Decimal {
  switch (rule) {
    case 'NEAREST_1000':
      return roundUpTo(value, 1000);
    case 'NEAREST_5000':
      return roundUpTo(value, 5000);
    case 'NEAREST_10000':
      return roundUpTo(value, 10000);
    case 'CHARM_9': {
      // 487,300 → 495,000 : round up to the next 5,000 then drop 5,000 and add
      // 4,999-style charm ending on the 1,000s digit.
      const base = roundUpTo(value, 10000);
      return base.minus(5000).greaterThanOrEqualTo(value) ? base.minus(5000) : base;
    }
    case 'NONE':
    default:
      return value;
  }
}

type RoundingRuleName = EngineCostingProfile['roundingRule'];

function roundUpTo(value: Decimal, step: number): Decimal {
  if (value.lessThanOrEqualTo(0)) return value;
  return value.dividedBy(step).ceil().times(step);
}

/**
 * Recommended selling price for a given total cost, per the profile's strategy.
 *
 * TARGET_GROSS_MARGIN: price = total_cost / (1 - margin)
 *   — margin is measured against REVENUE, so dividing (not multiplying) is what
 *     actually delivers the target. cost × 1.3 yields a 23% margin, not 30%.
 * TARGET_FOOD_COST:    price = ingredient_cost / target_food_cost_pct
 * COST_PLUS_MARKUP:    price = total_cost × multiplier
 * FIXED_PROFIT:        price = total_cost + desired_profit
 */
export function recommendPrice(
  profile: EngineCostingProfile,
  args: { totalCost: Decimal; ingredientCost: Decimal },
): { raw: Decimal; rounded: Decimal; formula: FormulaTrace } {
  const { totalCost, ingredientCost } = args;
  let raw: Decimal;
  let formula: FormulaTrace;

  switch (profile.pricingStrategy) {
    case 'TARGET_GROSS_MARGIN': {
      const margin = d(profile.targetGrossMargin);
      if (margin.greaterThanOrEqualTo(1) || margin.lessThan(0)) {
        throw new CostEngineError(
          `targetGrossMargin must be in [0,1), got ${margin.toFixed()}`,
          'INVALID_TARGET_MARGIN',
        );
      }
      raw = totalCost.dividedBy(new Decimal(1).minus(margin));
      formula = trace(
        'Recommended price',
        'قیمت فروش پیشنهادی',
        'total_cost / (1 - target_gross_margin)',
        `${totalCost.toFixed()} / (1 - ${margin.toFixed()})`,
        raw,
      );
      break;
    }
    case 'TARGET_FOOD_COST': {
      const target = d(profile.targetFoodCostPct);
      if (target.lessThanOrEqualTo(0) || target.greaterThan(1)) {
        throw new CostEngineError(
          `targetFoodCostPct must be in (0,1], got ${target.toFixed()}`,
          'INVALID_TARGET_FOOD_COST',
        );
      }
      raw = ingredientCost.dividedBy(target);
      formula = trace(
        'Recommended price',
        'قیمت فروش پیشنهادی',
        'ingredient_cost / target_food_cost_percent',
        `${ingredientCost.toFixed()} / ${target.toFixed()}`,
        raw,
      );
      break;
    }
    case 'COST_PLUS_MARKUP': {
      const mult = d(profile.markupMultiplier);
      raw = totalCost.times(mult);
      formula = trace(
        'Recommended price',
        'قیمت فروش پیشنهادی',
        'total_cost × markup_multiplier',
        `${totalCost.toFixed()} × ${mult.toFixed()}`,
        raw,
      );
      break;
    }
    case 'FIXED_PROFIT':
    default: {
      const profit = d(profile.fixedDesiredProfit);
      raw = totalCost.plus(profit);
      formula = trace(
        'Recommended price',
        'قیمت فروش پیشنهادی',
        'total_cost + fixed_desired_profit',
        `${totalCost.toFixed()} + ${profit.toFixed()}`,
        raw,
      );
      break;
    }
  }

  return { raw: money(raw), rounded: money(applyRounding(raw, profile.roundingRule)), formula };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full menu-item costing
// ─────────────────────────────────────────────────────────────────────────────

export function costMenuItem(
  item: EngineMenuItem,
  profile: EngineCostingProfile,
  ctx: EngineContext,
): MenuItemCostResult {
  const formulas: FormulaTrace[] = [];

  const recipeResult: RecipeCostResult | null = item.recipeId
    ? costRecipe(item.recipeId, ctx)
    : null;

  const ingredientCost = d(recipeResult?.ingredientCost ?? 0);
  const subRecipeCost = d(recipeResult?.subRecipeCost ?? 0);
  let packagingCost = d(recipeResult?.packagingCost ?? 0);
  let wasteAdjustment = d(recipeResult?.wasteAdjustment ?? 0);

  // A packaging cost typed on the item replaces whatever the BOM contained.
  if (item.packagingCostOverride !== null && item.packagingCostOverride !== undefined) {
    packagingCost = d(item.packagingCostOverride);
  }

  // Global shrink buffer on top of per-line yields.
  const buffer = d(profile.wasteBufferPct);
  if (buffer.lessThan(0) || buffer.greaterThanOrEqualTo(1)) {
    throw new CostEngineError(
      `wasteBufferPct must be in [0,1), got ${buffer.toFixed()}`,
      'INVALID_WASTE_BUFFER',
    );
  }
  const foodCostBeforeBuffer = ingredientCost.plus(subRecipeCost);
  const bufferAmount = foodCostBeforeBuffer.times(buffer);
  wasteAdjustment = wasteAdjustment.plus(bufferAmount);
  const foodCost = foodCostBeforeBuffer.plus(bufferAmount);

  const laborMinutes = item.laborMinutesOverride ?? recipeResult?.laborMinutes ?? 0;

  // Percent-of-revenue methods need a price, but the price depends on cost.
  // Resolve it with a fixed point: start from the stored price if there is one,
  // otherwise iterate — each pass is a contraction because the percentages sum
  // to well under 1, so it converges in a handful of steps.
  const storedPrice = item.sellingPrice != null ? d(item.sellingPrice) : null;
  const priceDependent =
    profile.laborMethod === 'PERCENT_OF_REVENUE' ||
    profile.overheadMethod === 'PERCENT_OF_REVENUE';

  let workingPrice = storedPrice ?? foodCost.times(3);
  let laborCost = ZERO;
  let overheadCost = ZERO;
  let totalCost = ZERO;
  let recommended = { raw: ZERO, rounded: ZERO, formula: null as FormulaTrace | null };

  const iterations = storedPrice || !priceDependent ? 1 : 25;
  for (let i = 0; i < iterations; i++) {
    const labor = calculateLaborCost(profile, laborMinutes, workingPrice);
    const overhead = calculateOverheadCost(profile, {
      sellingPrice: workingPrice,
      foodCost,
      laborMinutes,
      override: item.overheadCostOverride,
    });
    laborCost = labor.cost;
    overheadCost = overhead.cost;
    totalCost = foodCost.plus(packagingCost).plus(laborCost).plus(overheadCost);

    const rec = recommendPrice(profile, { totalCost, ingredientCost: foodCost });
    recommended = { raw: rec.raw, rounded: rec.rounded, formula: rec.formula };

    if (storedPrice) break;
    const next = rec.rounded;
    if (next.minus(workingPrice).abs().lessThan(1)) {
      workingPrice = next;
      break;
    }
    workingPrice = next;
  }

  // Re-derive the traces against the settled price.
  const laborFinal = calculateLaborCost(profile, laborMinutes, workingPrice);
  const overheadFinal = calculateOverheadCost(profile, {
    sellingPrice: workingPrice,
    foodCost,
    laborMinutes,
    override: item.overheadCostOverride,
  });
  formulas.push(
    trace(
      'Food cost',
      'هزینه مواد اولیه',
      'ingredient_cost + sub_recipe_cost + waste_buffer',
      `${ingredientCost.toFixed()} + ${subRecipeCost.toFixed()} + ${bufferAmount.toFixed()}`,
      foodCost,
    ),
    laborFinal.formula,
    overheadFinal.formula,
    trace(
      'Total cost',
      'قیمت تمام‌شده',
      'food_cost + packaging + labor + overhead',
      `${foodCost.toFixed()} + ${packagingCost.toFixed()} + ${laborCost.toFixed()} + ${overheadCost.toFixed()}`,
      totalCost,
    ),
  );
  if (recommended.formula) formulas.push(recommended.formula);

  // Final selling price: a manual override always wins.
  let sellingPrice: Decimal;
  let priceSource: MenuItemCostResult['priceSource'];
  if (item.priceIsOverridden && storedPrice) {
    sellingPrice = storedPrice;
    priceSource = 'MANUAL_OVERRIDE';
  } else if (storedPrice) {
    sellingPrice = storedPrice;
    priceSource = 'STORED';
  } else {
    sellingPrice = recommended.rounded;
    priceSource = 'RECOMMENDED';
  }

  const grossProfit = sellingPrice.minus(totalCost);
  const grossMarginPct = ratio(grossProfit, sellingPrice);
  const foodCostPct = ratio(foodCost, sellingPrice);
  const laborCostPct = ratio(laborCost, sellingPrice);
  const overheadCostPct = ratio(overheadCost, sellingPrice);
  const primeCostPct = ratio(foodCost.plus(laborCost), sellingPrice);

  formulas.push(
    trace('Gross profit', 'سود ناخالص', 'selling_price - total_cost',
      `${sellingPrice.toFixed()} - ${totalCost.toFixed()}`, grossProfit),
    trace('Gross margin %', 'درصد سود ناخالص', 'gross_profit / selling_price',
      `${grossProfit.toFixed()} / ${sellingPrice.toFixed()}`, grossMarginPct),
    trace('Food cost %', 'درصد هزینه مواد اولیه', 'food_cost / selling_price',
      `${foodCost.toFixed()} / ${sellingPrice.toFixed()}`, foodCostPct),
    trace('Prime cost %', 'درصد هزینه اولیه', '(food_cost + labor) / selling_price',
      `(${foodCost.toFixed()} + ${laborCost.toFixed()}) / ${sellingPrice.toFixed()}`, primeCostPct),
  );

  // Tax: menu prices in Iran are normally quoted tax-inclusive.
  const taxRate = d(profile.taxRate);
  const priceExcludingTax = profile.taxInclusive
    ? sellingPrice.dividedBy(new Decimal(1).plus(taxRate))
    : sellingPrice;
  const taxAmount = profile.taxInclusive
    ? sellingPrice.minus(priceExcludingTax)
    : sellingPrice.times(taxRate);

  return {
    menuItemId: item.id,
    recipeId: item.recipeId ?? null,
    ingredientCost: money(ingredientCost).toFixed(),
    subRecipeCost: money(subRecipeCost).toFixed(),
    packagingCost: money(packagingCost).toFixed(),
    wasteAdjustment: money(wasteAdjustment).toFixed(),
    laborCost: money(laborCost).toFixed(),
    overheadCost: money(overheadCost).toFixed(),
    totalCost: money(totalCost).toFixed(),
    laborMinutes,
    sellingPrice: money(sellingPrice).toFixed(),
    priceSource,
    recommendedPrice: money(recommended.rounded).toFixed(),
    rawRecommendedPrice: money(recommended.raw).toFixed(),
    grossProfit: money(grossProfit).toFixed(),
    grossMarginPct: percent(grossMarginPct).toFixed(),
    foodCostPct: percent(foodCostPct).toFixed(),
    laborCostPct: percent(laborCostPct).toFixed(),
    overheadCostPct: percent(overheadCostPct).toFixed(),
    primeCostPct: percent(primeCostPct).toFixed(),
    taxAmount: money(taxAmount).toFixed(),
    priceExcludingTax: money(priceExcludingTax).toFixed(),
    isBelowMinimumMargin: grossMarginPct.lessThan(d(profile.minimumMargin)),
    isUnprofitable: grossProfit.lessThanOrEqualTo(0),
    lines: recipeResult?.lines ?? [],
    formulas,
  };
}

function trace(
  label: string,
  labelPersian: string,
  expression: string,
  substituted: string,
  result: Decimal,
): FormulaTrace {
  return { label, labelPersian, expression, substituted, result: result.toFixed() };
}
