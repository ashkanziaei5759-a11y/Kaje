/**
 * MENU ENGINEERING & VARIANCE ANALYSIS
 *
 * Menu engineering classifies each item on two axes:
 *
 *   popularity          — share of units sold vs. an even split across the menu
 *   contribution margin — profit per unit vs. the menu-wide average
 *
 *                       high CM        low CM
 *   high popularity     STAR           PLOWHORSE
 *   low  popularity     PUZZLE         DOG
 *
 * The popularity threshold is the classic Kasavana–Smith 70% rule: an item is
 * "popular" if its share of sales is at least 70% of an even share. With N
 * items an even share is 1/N, so the line sits at 0.7/N. The factor is a
 * parameter, not a constant, because a 6-item menu behaves differently from a
 * 60-item one.
 */
import { Decimal, d, money, percent, safeDivide, ratio, ZERO } from '../money';
import type { Numericish } from './types';

export type MenuClass = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';

export type MenuRecommendation =
  | 'KEEP'
  | 'PROMOTE'
  | 'INCREASE_PRICE'
  | 'REDUCE_COST'
  | 'REPOSITION'
  | 'REMOVE';

export interface MenuPerformanceInput {
  menuItemId: string;
  name: string;
  namePersian: string;
  unitsSold: number;
  /** Price actually realised per unit. */
  sellingPrice: Numericish;
  /** Total cost per unit, from the cost snapshots. */
  totalCost: Numericish;
}

export interface MenuPerformanceResult {
  menuItemId: string;
  name: string;
  namePersian: string;
  unitsSold: number;
  revenue: string;
  cost: string;
  /** Per-unit profit. */
  contributionMargin: string;
  /** Total profit across all units sold. */
  totalProfit: string;
  marginPct: string;
  /** Share of total units sold across the menu. */
  popularityPct: string;
  classification: MenuClass;
  recommendations: MenuRecommendation[];
  /** Position on the 2×2 matrix, relative to the two thresholds. */
  isHighPopularity: boolean;
  isHighMargin: boolean;
}

export interface MenuEngineeringReport {
  items: MenuPerformanceResult[];
  totalUnitsSold: number;
  totalRevenue: string;
  totalCost: string;
  totalProfit: string;
  /** Menu-wide average contribution margin — the vertical threshold. */
  averageContributionMargin: string;
  /** Share of sales an item must reach to count as popular. */
  popularityThreshold: string;
  counts: Record<MenuClass, number>;
}

export function analyseMenu(
  inputs: MenuPerformanceInput[],
  options: { popularityFactor?: Numericish } = {},
): MenuEngineeringReport {
  const popularityFactor = d(options.popularityFactor ?? 0.7);

  const totalUnitsSold = inputs.reduce((acc, i) => acc + i.unitsSold, 0);
  const itemCount = inputs.length;

  let totalRevenue = ZERO;
  let totalCost = ZERO;
  let weightedMarginTotal = ZERO;

  const rows = inputs.map((input) => {
    const price = d(input.sellingPrice);
    const cost = d(input.totalCost);
    const cm = price.minus(cost);
    const revenue = price.times(input.unitsSold);
    const costTotal = cost.times(input.unitsSold);

    totalRevenue = totalRevenue.plus(revenue);
    totalCost = totalCost.plus(costTotal);
    weightedMarginTotal = weightedMarginTotal.plus(cm.times(input.unitsSold));

    return { input, price, cost, cm, revenue, costTotal };
  });

  // Average CM is weighted by units sold — an item selling 500 units should
  // move the threshold more than one selling 5.
  const averageCM =
    totalUnitsSold > 0 ? weightedMarginTotal.dividedBy(totalUnitsSold) : ZERO;

  const popularityThreshold =
    itemCount > 0 ? popularityFactor.dividedBy(itemCount) : ZERO;

  const counts: Record<MenuClass, number> = { STAR: 0, PLOWHORSE: 0, PUZZLE: 0, DOG: 0 };

  const items = rows.map(({ input, price, cost, cm, revenue, costTotal }) => {
    const popularity = ratio(input.unitsSold, totalUnitsSold);
    const isHighPopularity = popularity.greaterThanOrEqualTo(popularityThreshold);
    const isHighMargin = cm.greaterThanOrEqualTo(averageCM);

    const classification: MenuClass = isHighPopularity
      ? isHighMargin ? 'STAR' : 'PLOWHORSE'
      : isHighMargin ? 'PUZZLE' : 'DOG';
    counts[classification] += 1;

    return {
      menuItemId: input.menuItemId,
      name: input.name,
      namePersian: input.namePersian,
      unitsSold: input.unitsSold,
      revenue: money(revenue).toFixed(),
      cost: money(costTotal).toFixed(),
      contributionMargin: money(cm).toFixed(),
      totalProfit: money(cm.times(input.unitsSold)).toFixed(),
      marginPct: percent(ratio(cm, price)).toFixed(),
      popularityPct: percent(popularity).toFixed(),
      classification,
      recommendations: recommend(classification, cm, price),
      isHighPopularity,
      isHighMargin,
    };
  });

  return {
    items,
    totalUnitsSold,
    totalRevenue: money(totalRevenue).toFixed(),
    totalCost: money(totalCost).toFixed(),
    totalProfit: money(totalRevenue.minus(totalCost)).toFixed(),
    averageContributionMargin: money(averageCM).toFixed(),
    popularityThreshold: percent(popularityThreshold).toFixed(),
    counts,
  };
}

function recommend(
  classification: MenuClass,
  contributionMargin: Decimal,
  price: Decimal,
): MenuRecommendation[] {
  // An item that loses money is a removal candidate whatever its popularity.
  if (contributionMargin.lessThanOrEqualTo(0)) {
    return classification === 'DOG' ? ['REMOVE'] : ['INCREASE_PRICE', 'REDUCE_COST'];
  }

  switch (classification) {
    case 'STAR':
      // Sells well and earns well — protect it, feature it, keep the recipe stable.
      return ['KEEP', 'PROMOTE'];
    case 'PLOWHORSE':
      // Popular but thin. Push the margin up without scaring the customer off.
      return ['REDUCE_COST', 'INCREASE_PRICE'];
    case 'PUZZLE':
      // Profitable but nobody orders it — a visibility problem, not a price one.
      return ['PROMOTE', 'REPOSITION'];
    case 'DOG':
    default:
      return ['REMOVE', 'REPOSITION'];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actual vs theoretical food cost
// ─────────────────────────────────────────────────────────────────────────────

export type VarianceCause =
  | 'WASTE'
  | 'OVER_PORTIONING'
  | 'SHRINKAGE'
  | 'INCORRECT_RECIPE'
  | 'PRICE_INCREASE'
  | 'INVENTORY_ERROR';

export interface VarianceInput {
  /** What the recipes say the period's sales should have consumed. */
  theoreticalCost: Numericish;
  /** opening + purchases - closing, from real stock counts. */
  openingInventory: Numericish;
  purchases: Numericish;
  closingInventory: Numericish;
  /** Recorded waste for the period. */
  recordedWaste: Numericish;
  /** Revenue, used to express both costs as a percentage of sales. */
  revenue: Numericish;
}

export interface VarianceResult {
  theoreticalCost: string;
  actualCost: string;
  variance: string;
  variancePct: string;
  theoreticalFoodCostPct: string;
  actualFoodCostPct: string;
  recordedWaste: string;
  /** Variance left over once recorded waste is accounted for. */
  unexplainedVariance: string;
  severity: 'OK' | 'WATCH' | 'CRITICAL';
  likelyCauses: VarianceCause[];
}

/**
 * actual_cost = opening_inventory + purchases - closing_inventory
 *
 * That figure captures everything that physically left the store: sales, waste,
 * theft and portioning error alike. Subtracting the theoretical cost of what was
 * sold isolates the loss.
 */
export function analyseVariance(input: VarianceInput): VarianceResult {
  const theoretical = d(input.theoreticalCost);
  const actual = d(input.openingInventory)
    .plus(d(input.purchases))
    .minus(d(input.closingInventory));

  const variance = actual.minus(theoretical);
  const variancePct = ratio(variance, theoretical);
  const waste = d(input.recordedWaste);
  const unexplained = variance.minus(waste);

  const absPct = variancePct.abs();
  const severity: VarianceResult['severity'] = absPct.greaterThanOrEqualTo(0.1)
    ? 'CRITICAL'
    : absPct.greaterThanOrEqualTo(0.03)
      ? 'WATCH'
      : 'OK';

  const likelyCauses: VarianceCause[] = [];
  if (variance.greaterThan(0)) {
    // Actual exceeded theory — more stock left the building than recipes explain.
    if (waste.greaterThan(0)) likelyCauses.push('WASTE');
    if (unexplained.greaterThan(0)) {
      likelyCauses.push('OVER_PORTIONING', 'SHRINKAGE', 'PRICE_INCREASE');
    }
  } else if (variance.lessThan(0)) {
    // Theory exceeded actual — usually a data problem, not a windfall.
    likelyCauses.push('INCORRECT_RECIPE', 'INVENTORY_ERROR');
  }

  return {
    theoreticalCost: money(theoretical).toFixed(),
    actualCost: money(actual).toFixed(),
    variance: money(variance).toFixed(),
    variancePct: percent(variancePct).toFixed(),
    theoreticalFoodCostPct: percent(ratio(theoretical, input.revenue)).toFixed(),
    actualFoodCostPct: percent(ratio(actual, input.revenue)).toFixed(),
    recordedWaste: money(waste).toFixed(),
    unexplainedVariance: money(unexplained).toFixed(),
    severity,
    likelyCauses,
  };
}
