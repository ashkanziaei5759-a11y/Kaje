/**
 * Loads the database rows the pure engines need, and maps them into the
 * engines' plain value objects.
 *
 * The whole restaurant's ingredient/recipe graph is loaded in three queries and
 * indexed in memory. Costing a menu item walks an arbitrarily deep sub-recipe
 * tree; doing that with per-node queries would be an N+1 storm, and the dataset
 * (hundreds of ingredients, dozens of recipes) comfortably fits in memory.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type {
  EngineContext,
  EngineCostingProfile,
  EngineIngredient,
  EngineMenuItem,
  EngineRecipe,
  EngineUnit,
} from '@/lib/engine/types';

export async function loadEngineContext(restaurantId: string): Promise<EngineContext> {
  const [units, ingredients, recipes] = await Promise.all([
    prisma.unitDefinition.findMany({ where: { restaurantId } }),
    prisma.ingredient.findMany({ where: { restaurantId } }),
    prisma.recipe.findMany({
      where: { restaurantId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  return {
    units: new Map(
      units.map((u): [string, EngineUnit] => [
        u.id,
        {
          id: u.id,
          code: u.code,
          dimension: u.dimension,
          factorToBase: u.factorToBase.toString(),
        },
      ]),
    ),
    ingredients: new Map(
      ingredients.map((i): [string, EngineIngredient] => [
        i.id,
        {
          id: i.id,
          name: i.name,
          namePersian: i.namePersian,
          // Weighted average is the honest basis for costing; the latest price
          // only reflects the most recent delivery. Fall back to the last price
          // for an ingredient that has never been received.
          purchaseUnitPrice: (i.averagePrice.isZero()
            ? i.lastPurchasePrice
            : i.averagePrice
          ).toString(),
          purchaseUnitId: i.purchaseUnitId,
          recipeUnitId: i.recipeUnitId,
          conversionFactor: i.conversionFactor.toString(),
          yieldPercent: i.yieldPercent.toString(),
          isPackaging: i.isPackaging,
        },
      ]),
    ),
    recipes: new Map(
      recipes.map((r): [string, EngineRecipe] => [
        r.id,
        {
          id: r.id,
          name: r.name,
          namePersian: r.namePersian,
          type: r.type,
          yieldQuantity: r.yieldQuantity.toString(),
          yieldUnitId: r.yieldUnitId,
          recipeYieldPercent: r.recipeYieldPercent.toString(),
          preparationLossPercent: r.preparationLossPercent.toString(),
          prepTimeMinutes: r.prepTimeMinutes,
          cookTimeMinutes: r.cookTimeMinutes,
          currentVersion: r.currentVersion,
          items: r.items.map((item) => ({
            id: item.id,
            ingredientId: item.ingredientId,
            subRecipeId: item.subRecipeId,
            quantity: item.quantity.toString(),
            unitId: item.unitId,
            yieldPercentOverride: item.yieldPercentOverride?.toString() ?? null,
            wastePercent: item.wastePercent.toString(),
            isOptional: item.isOptional,
          })),
        },
      ]),
    ),
  };
}

type ProfileRow = Awaited<ReturnType<typeof prisma.costingProfile.findFirst>>;

export function toEngineProfile(row: NonNullable<ProfileRow>): EngineCostingProfile {
  return {
    id: row.id,
    name: row.name,
    laborMethod: row.laborMethod,
    laborCostPerMinute: row.laborCostPerMinute.toString(),
    laborPercentOfRevenue: row.laborPercentOfRevenue.toString(),
    monthlyLaborCost: row.monthlyLaborCost.toString(),
    overheadMethod: row.overheadMethod,
    monthlyOverheadCost: row.monthlyOverheadCost.toString(),
    expectedMonthlyUnits: row.expectedMonthlyUnits,
    overheadPercentOfRevenue: row.overheadPercentOfRevenue.toString(),
    overheadPercentOfFoodCost: row.overheadPercentOfFoodCost.toString(),
    overheadPerLaborMinute: row.overheadPerLaborMinute.toString(),
    pricingStrategy: row.pricingStrategy,
    targetGrossMargin: row.targetGrossMargin.toString(),
    targetFoodCostPct: row.targetFoodCostPct.toString(),
    targetNetMargin: row.targetNetMargin.toString(),
    markupMultiplier: row.markupMultiplier.toString(),
    fixedDesiredProfit: row.fixedDesiredProfit.toString(),
    minimumMargin: row.minimumMargin.toString(),
    roundingRule: row.roundingRule,
    taxRate: row.taxRate.toString(),
    taxInclusive: row.taxInclusive,
    wasteBufferPct: row.wasteBufferPct.toString(),
  };
}

type MenuItemRow = Awaited<ReturnType<typeof prisma.menuItem.findFirst>>;

export function toEngineMenuItem(row: NonNullable<MenuItemRow>): EngineMenuItem {
  return {
    id: row.id,
    name: row.name,
    namePersian: row.namePersian,
    recipeId: row.recipeId,
    sellingPrice: row.sellingPrice?.toString() ?? null,
    priceIsOverridden: row.priceIsOverridden,
    packagingCostOverride: row.packagingCostOverride?.toString() ?? null,
    overheadCostOverride: row.overheadCostOverride?.toString() ?? null,
    laborMinutesOverride: row.laborMinutesOverride,
  };
}

/** Resolves the profile for an item, falling back to the restaurant default. */
export async function resolveCostingProfile(
  restaurantId: string,
  profileId?: string | null,
): Promise<EngineCostingProfile> {
  const row = profileId
    ? await prisma.costingProfile.findUnique({ where: { id: profileId } })
    : await prisma.costingProfile.findFirst({
        where: { restaurantId, isDefault: true, isActive: true },
      });

  if (!row) {
    throw new Error(
      `No costing profile found for restaurant ${restaurantId}. ` +
        'Seed a default profile before costing menu items.',
    );
  }
  return toEngineProfile(row);
}
