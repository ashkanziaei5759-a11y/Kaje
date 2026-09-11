/**
 * WHAT-IF COSTING
 *
 * Recomputes a menu item's cost against DRAFT values that have not been saved:
 * a different ingredient price, a changed BOM quantity, a new target margin.
 *
 * The important property is that this runs the SAME engine the save path runs.
 * The obvious alternative — reimplementing the arithmetic in the browser so the
 * number updates as you type — would mean two implementations of the costing
 * rules drifting apart, and the figure you approve would not be the figure that
 * gets stored. Here the preview is the real calculation, applied to an
 * in-memory copy of the context. Nothing is written.
 */
import 'server-only';
import { costMenuItem } from '@/lib/engine/cost-engine';
import type {
  EngineContext, EngineCostingProfile, EngineMenuItem, MenuItemCostResult,
} from '@/lib/engine/types';
import { loadEngineContext, resolveCostingProfile, toEngineMenuItem } from './context';
import { prisma } from '@/lib/db';

/** A single unsaved edit the caller wants reflected in the result. */
export interface CostDraft {
  /** Ingredient purchase-unit prices, keyed by ingredient id. */
  ingredientPrices?: Record<string, string>;
  /** Ingredient usable-yield fractions, keyed by ingredient id. */
  ingredientYields?: Record<string, string>;
  /** BOM line quantities, keyed by recipe-item id. */
  lineQuantities?: Record<string, string>;
  /** BOM lines to leave out entirely — for "what if we drop the walnuts?" */
  removedLineIds?: string[];
  /** Costing-profile overrides, applied on top of the item's profile. */
  profile?: Partial<Record<keyof EngineCostingProfile, string | number | boolean>>;
  /** A selling price to measure the margin against. */
  sellingPrice?: string | null;
  /** Per-item labour minutes override. */
  laborMinutes?: number | null;
}

export interface SimulationResult {
  /** Costing against the draft. */
  draft: MenuItemCostResult;
  /** Costing as things stand in the database, for side-by-side comparison. */
  current: MenuItemCostResult;
}

export async function simulateMenuItemCost(
  restaurantId: string,
  menuItemId: string,
  draft: CostDraft,
): Promise<SimulationResult> {
  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, restaurantId },
  });
  if (!item) throw new Error(`Menu item not found: ${menuItemId}`);

  const [baseContext, baseProfile] = await Promise.all([
    loadEngineContext(restaurantId),
    resolveCostingProfile(restaurantId, item.costingProfileId),
  ]);

  const engineItem = toEngineMenuItem(item);
  const current = costMenuItem(engineItem, baseProfile, baseContext);

  const draftContext = applyDraftToContext(baseContext, draft);
  const draftProfile = { ...baseProfile, ...coerceProfile(draft.profile) };
  const draftItem: EngineMenuItem = {
    ...engineItem,
    sellingPrice:
      draft.sellingPrice === undefined ? engineItem.sellingPrice : draft.sellingPrice,
    laborMinutesOverride:
      draft.laborMinutes === undefined ? engineItem.laborMinutesOverride : draft.laborMinutes,
  };

  return { draft: costMenuItem(draftItem, draftProfile, draftContext), current };
}

/**
 * Clones the parts of the engine context the draft touches.
 *
 * Only the touched entries are copied — the maps themselves are rebuilt but the
 * untouched value objects are shared, which is safe because the engine never
 * mutates them.
 */
function applyDraftToContext(base: EngineContext, draft: CostDraft): EngineContext {
  const ingredients = new Map(base.ingredients);
  const recipes = new Map(base.recipes);

  for (const [id, price] of Object.entries(draft.ingredientPrices ?? {})) {
    const existing = ingredients.get(id);
    if (existing) ingredients.set(id, { ...existing, purchaseUnitPrice: price });
  }

  for (const [id, yieldPercent] of Object.entries(draft.ingredientYields ?? {})) {
    const existing = ingredients.get(id);
    if (existing) ingredients.set(id, { ...existing, yieldPercent });
  }

  const quantities = draft.lineQuantities ?? {};
  const removed = new Set(draft.removedLineIds ?? []);

  if (Object.keys(quantities).length > 0 || removed.size > 0) {
    for (const [recipeId, recipe] of recipes) {
      let changed = false;
      const items = recipe.items
        .filter((line) => {
          if (removed.has(line.id)) { changed = true; return false; }
          return true;
        })
        .map((line) => {
          const quantity = quantities[line.id];
          if (quantity === undefined) return line;
          changed = true;
          return { ...line, quantity };
        });
      if (changed) recipes.set(recipeId, { ...recipe, items });
    }
  }

  return { units: base.units, ingredients, recipes };
}

/**
 * Profile fields arrive from JSON as strings. Booleans and the integer unit
 * count need their real types back, and unknown keys are dropped rather than
 * passed through to the engine.
 */
function coerceProfile(
  overrides: CostDraft['profile'],
): Partial<EngineCostingProfile> {
  if (!overrides) return {};
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === '') continue;
    if (key === 'taxInclusive') {
      out[key] = value === true || value === 'true';
    } else if (key === 'expectedMonthlyUnits') {
      const n = Number(value);
      out[key] = Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
    } else {
      out[key] = value;
    }
  }
  return out as Partial<EngineCostingProfile>;
}
