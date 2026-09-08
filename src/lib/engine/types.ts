/**
 * Plain, storage-agnostic inputs for the costing engine.
 *
 * The engine deliberately does NOT touch Prisma. It takes value objects, so it
 * can be unit-tested exhaustively without a database, reused for "what-if"
 * simulations on unsaved data, and re-run against historical snapshots.
 */
import type { Decimal } from '../money';

export type Numericish = Decimal | string | number;

export type UnitDimension = 'MASS' | 'VOLUME' | 'COUNT';

export interface EngineUnit {
  id: string;
  code: string;
  dimension: UnitDimension;
  factorToBase: Numericish;
}

export interface EngineIngredient {
  id: string;
  name: string;
  namePersian: string;
  /** Price of ONE purchase unit. Normally the weighted average cost. */
  purchaseUnitPrice: Numericish;
  purchaseUnitId: string;
  recipeUnitId: string;
  /** Recipe units per ONE purchase unit. */
  conversionFactor: Numericish;
  /** Usable fraction after trimming, in (0, 1]. */
  yieldPercent: Numericish;
  /** Packaging is excluded from food cost and reported separately. */
  isPackaging: boolean;
}

export interface EngineRecipeItem {
  id: string;
  ingredientId?: string | null;
  subRecipeId?: string | null;
  quantity: Numericish;
  unitId: string;
  yieldPercentOverride?: Numericish | null;
  wastePercent?: Numericish | null;
  isOptional?: boolean;
}

export interface EngineRecipe {
  id: string;
  name: string;
  namePersian: string;
  type: 'MENU_ITEM' | 'SUB_RECIPE' | 'BATCH';
  items: EngineRecipeItem[];
  /** Portions produced by one execution. Cost is divided by this. */
  yieldQuantity: Numericish;
  yieldUnitId?: string | null;
  /** Cooking/evaporation loss as a surviving fraction, in (0, 1]. */
  recipeYieldPercent: Numericish;
  /** Extra prep loss as a fraction lost, in [0, 1). */
  preparationLossPercent: Numericish;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  currentVersion?: number;
}

export type LaborAllocationMethod = 'PER_MINUTE' | 'PERCENT_OF_REVENUE' | 'PER_UNIT' | 'NONE';

export type OverheadAllocationMethod =
  | 'PER_UNIT'
  | 'PERCENT_OF_REVENUE'
  | 'PERCENT_OF_FOOD_COST'
  | 'PER_LABOR_MINUTE'
  | 'NONE';

export type PricingStrategy =
  | 'TARGET_GROSS_MARGIN'
  | 'TARGET_FOOD_COST'
  | 'COST_PLUS_MARKUP'
  | 'FIXED_PROFIT';

export type RoundingRule =
  | 'NONE'
  | 'NEAREST_1000'
  | 'NEAREST_5000'
  | 'NEAREST_10000'
  | 'CHARM_9';

/** Every configurable business assumption, in one object. Nothing hard-coded. */
export interface EngineCostingProfile {
  id: string;
  name: string;

  laborMethod: LaborAllocationMethod;
  laborCostPerMinute: Numericish;
  laborPercentOfRevenue: Numericish;
  monthlyLaborCost: Numericish;

  overheadMethod: OverheadAllocationMethod;
  monthlyOverheadCost: Numericish;
  expectedMonthlyUnits: number;
  overheadPercentOfRevenue: Numericish;
  overheadPercentOfFoodCost: Numericish;
  overheadPerLaborMinute: Numericish;

  pricingStrategy: PricingStrategy;
  targetGrossMargin: Numericish;
  targetFoodCostPct: Numericish;
  targetNetMargin: Numericish;
  markupMultiplier: Numericish;
  fixedDesiredProfit: Numericish;
  minimumMargin: Numericish;

  roundingRule: RoundingRule;
  taxRate: Numericish;
  taxInclusive: boolean;

  wasteBufferPct: Numericish;
}

export interface EngineMenuItem {
  id: string;
  name: string;
  namePersian: string;
  recipeId?: string | null;
  sellingPrice?: Numericish | null;
  priceIsOverridden: boolean;
  packagingCostOverride?: Numericish | null;
  overheadCostOverride?: Numericish | null;
  laborMinutesOverride?: number | null;
}

/** Everything the engine needs, indexed for O(1) lookup during recursion. */
export interface EngineContext {
  units: Map<string, EngineUnit>;
  ingredients: Map<string, EngineIngredient>;
  recipes: Map<string, EngineRecipe>;
}

/** One costed BOM line, kept for the "why does this cost so much?" view. */
export interface CostLine {
  kind: 'INGREDIENT' | 'SUB_RECIPE';
  refId: string;
  name: string;
  namePersian: string;
  /** As written on the recipe. */
  quantity: string;
  unitCode: string;
  /** Quantity actually consumed once yield/waste is grossed up. */
  effectiveQuantity: string;
  /** Cost of one recipe unit BEFORE yield adjustment. */
  baseUnitCost: string;
  /** Cost of one recipe unit AFTER yield adjustment. */
  effectiveUnitCost: string;
  /** effectiveQuantity × effectiveUnitCost. */
  totalCost: string;
  /** Portion of totalCost attributable purely to yield/waste loss. */
  wasteCost: string;
  isPackaging: boolean;
  /** For sub-recipes: the nested breakdown. */
  children?: CostLine[];
}

/** Result of costing a recipe (one portion). */
export interface RecipeCostResult {
  recipeId: string;
  /** Non-packaging ingredient cost, yield-adjusted, per portion. */
  ingredientCost: string;
  /** Cost contributed by nested sub-recipes, per portion. */
  subRecipeCost: string;
  /** Packaging lines inside the BOM, per portion. */
  packagingCost: string;
  /** Money lost to yield/waste, already included in the costs above. */
  wasteAdjustment: string;
  /** ingredientCost + subRecipeCost + packagingCost. */
  totalCost: string;
  /** Sum of prep + cook minutes across this recipe and its sub-recipes. */
  laborMinutes: number;
  lines: CostLine[];
}

/** Full costing of a menu item, including labor, overhead and pricing. */
export interface MenuItemCostResult {
  menuItemId: string;
  recipeId: string | null;

  ingredientCost: string;
  subRecipeCost: string;
  packagingCost: string;
  wasteAdjustment: string;
  laborCost: string;
  overheadCost: string;
  totalCost: string;

  laborMinutes: number;

  sellingPrice: string;
  /** Where sellingPrice came from. */
  priceSource: 'MANUAL_OVERRIDE' | 'RECOMMENDED' | 'STORED';
  recommendedPrice: string;
  /** Recommended price before the rounding rule was applied. */
  rawRecommendedPrice: string;

  grossProfit: string;
  grossMarginPct: string;
  foodCostPct: string;
  laborCostPct: string;
  overheadCostPct: string;
  primeCostPct: string;

  taxAmount: string;
  priceExcludingTax: string;

  /** True when grossMarginPct falls below profile.minimumMargin. */
  isBelowMinimumMargin: boolean;
  /** True when the item loses money outright. */
  isUnprofitable: boolean;

  lines: CostLine[];
  /** Human-readable formulas, so the admin can audit every number. */
  formulas: FormulaTrace[];
}

export interface FormulaTrace {
  label: string;
  labelPersian: string;
  expression: string;
  substituted: string;
  result: string;
}
