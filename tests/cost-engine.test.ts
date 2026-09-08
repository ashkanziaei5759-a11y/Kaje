import { describe, it, expect } from 'vitest';
import { Decimal, d } from '../src/lib/money';
import {
  costRecipe,
  costMenuItem,
  recommendPrice,
  applyRounding,
  CostEngineError,
} from '../src/lib/engine/cost-engine';
import type {
  EngineContext,
  EngineCostingProfile,
  EngineIngredient,
  EngineRecipe,
} from '../src/lib/engine/types';

// ── fixtures ─────────────────────────────────────────────────────────────────

const UNITS = new Map(
  [
    { id: 'u_g', code: 'g', dimension: 'MASS' as const, factorToBase: 1 },
    { id: 'u_kg', code: 'kg', dimension: 'MASS' as const, factorToBase: 1000 },
    { id: 'u_ml', code: 'ml', dimension: 'VOLUME' as const, factorToBase: 1 },
    { id: 'u_l', code: 'l', dimension: 'VOLUME' as const, factorToBase: 1000 },
    { id: 'u_piece', code: 'piece', dimension: 'COUNT' as const, factorToBase: 1 },
  ].map((u) => [u.id, u]),
);

function ingredient(over: Partial<EngineIngredient> & { id: string }): EngineIngredient {
  return {
    name: over.id,
    namePersian: over.id,
    purchaseUnitPrice: 0,
    purchaseUnitId: 'u_kg',
    recipeUnitId: 'u_g',
    conversionFactor: 1000,
    yieldPercent: 1,
    isPackaging: false,
    ...over,
  };
}

function recipe(over: Partial<EngineRecipe> & { id: string }): EngineRecipe {
  return {
    name: over.id,
    namePersian: over.id,
    type: 'MENU_ITEM',
    items: [],
    yieldQuantity: 1,
    yieldUnitId: 'u_piece',
    recipeYieldPercent: 1,
    preparationLossPercent: 0,
    prepTimeMinutes: 0,
    cookTimeMinutes: 0,
    ...over,
  };
}

const PROFILE: EngineCostingProfile = {
  id: 'p1',
  name: 'default',
  laborMethod: 'PER_MINUTE',
  laborCostPerMinute: 2000,
  laborPercentOfRevenue: 0,
  monthlyLaborCost: 0,
  overheadMethod: 'PER_UNIT',
  monthlyOverheadCost: 300_000_000,
  expectedMonthlyUnits: 10_000,
  overheadPercentOfRevenue: 0,
  overheadPercentOfFoodCost: 0,
  overheadPerLaborMinute: 0,
  pricingStrategy: 'TARGET_GROSS_MARGIN',
  targetGrossMargin: 0.3,
  targetFoodCostPct: 0.3,
  targetNetMargin: 0.15,
  markupMultiplier: 3,
  fixedDesiredProfit: 0,
  minimumMargin: 0.1,
  roundingRule: 'NONE',
  taxRate: 0,
  taxInclusive: true,
  wasteBufferPct: 0,
};

// ── the worked example from the specification ────────────────────────────────

describe('the Kajeh worked example', () => {
  // Ingredient cost 280,000 + labor 30,000 + packaging 5,000 + overhead 30,000
  // = total cost 345,000, at a 30% target margin.
  const ctx: EngineContext = {
    units: UNITS,
    // 280,000 of ingredients built from a real BOM, plus 5,000 of packaging.
    ingredients: new Map([
      // 1,120,000/kg → 1,120/g → 250 g = 280,000
      ['i_chicken', ingredient({ id: 'i_chicken', purchaseUnitPrice: 1_120_000 })],
      ['i_box', ingredient({
        id: 'i_box',
        purchaseUnitPrice: 5000,
        purchaseUnitId: 'u_piece',
        recipeUnitId: 'u_piece',
        conversionFactor: 1,
        isPackaging: true,
      })],
    ]),
    recipes: new Map([
      ['r_kebab', recipe({
        id: 'r_kebab',
        // 15 minutes of labor → 15 × 2,000 = 30,000
        prepTimeMinutes: 8,
        cookTimeMinutes: 7,
        items: [
          { id: 'l1', ingredientId: 'i_chicken', quantity: 250, unitId: 'u_g' },
          { id: 'l2', ingredientId: 'i_box', quantity: 1, unitId: 'u_piece' },
        ],
      })],
    ]),
  };

  it('assembles the exact cost breakdown from the spec', () => {
    const result = costMenuItem(
      { id: 'm1', name: 'Kebab', namePersian: 'کباب', recipeId: 'r_kebab', priceIsOverridden: false },
      PROFILE,
      ctx,
    );

    expect(result.ingredientCost).toBe('280000');
    expect(result.laborCost).toBe('30000');       // 15 min × 2,000
    expect(result.packagingCost).toBe('5000');
    expect(result.overheadCost).toBe('30000');    // 300,000,000 / 10,000
    expect(result.totalCost).toBe('345000');
  });

  it('recommends a price that actually delivers the 30% target margin', () => {
    const { raw } = recommendPrice(PROFILE, {
      totalCost: d(345_000),
      ingredientCost: d(280_000),
    });
    // 345,000 / 0.7 — NOT 345,000 × 1.3, which would only yield a 23% margin.
    expect(raw.toFixed()).toBe('492857.1429');

    const achievedMargin = raw.minus(345_000).dividedBy(raw);
    expect(achievedMargin.toDecimalPlaces(6).toNumber()).toBeCloseTo(0.3, 6);
  });

  it('records a manual price override and reports the real margin on it', () => {
    const result = costMenuItem(
      {
        id: 'm1', name: 'Kebab', namePersian: 'کباب', recipeId: 'r_kebab',
        sellingPrice: 495_000, priceIsOverridden: true,
      },
      PROFILE,
      ctx,
    );
    expect(result.priceSource).toBe('MANUAL_OVERRIDE');
    expect(result.sellingPrice).toBe('495000');
    expect(result.grossProfit).toBe('150000');           // 495,000 - 345,000
    expect(Number(result.grossMarginPct)).toBeCloseTo(0.303030, 5);
    expect(Number(result.foodCostPct)).toBeCloseTo(0.565657, 5);
  });

  it('exposes every formula it used', () => {
    const result = costMenuItem(
      { id: 'm1', name: 'K', namePersian: 'ک', recipeId: 'r_kebab', priceIsOverridden: false },
      PROFILE,
      ctx,
    );
    const expressions = result.formulas.map((f) => f.expression);
    expect(expressions).toContain('food_cost + packaging + labor + overhead');
    expect(expressions).toContain('gross_profit / selling_price');
    expect(expressions).toContain('total_cost / (1 - target_gross_margin)');
  });
});

// ── unit conversion & yield ──────────────────────────────────────────────────

describe('unit conversion and yield', () => {
  it('costs 250 g out of a 10 kg / 8,500,000 purchase', () => {
    const ctx: EngineContext = {
      units: UNITS,
      // 8,500,000 for 10 kg → 850,000 per kg → 850 per gram
      ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 850_000 })]]),
      recipes: new Map([
        ['r', recipe({ id: 'r', items: [{ id: 'l', ingredientId: 'i', quantity: 250, unitId: 'u_g' }] })],
      ]),
    };
    // 250 × 850 = 212,500
    expect(costRecipe('r', ctx).ingredientCost).toBe('212500');
  });

  it('accepts a BOM line written in kg for an ingredient stocked in g', () => {
    const ctx: EngineContext = {
      units: UNITS,
      ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 850_000 })]]),
      recipes: new Map([
        ['r', recipe({ id: 'r', items: [{ id: 'l', ingredientId: 'i', quantity: 0.25, unitId: 'u_kg' }] })],
      ]),
    };
    expect(costRecipe('r', ctx).ingredientCost).toBe('212500');
  });

  it('charges the full purchase price across a reduced usable yield', () => {
    // 10 kg raw at 700,000/kg cleans down to 8 kg → 80% yield.
    // Real cost of usable meat = 700 per raw gram / 0.8 = 875 per usable gram.
    const ctx: EngineContext = {
      units: UNITS,
      ingredients: new Map([
        ['i', ingredient({ id: 'i', purchaseUnitPrice: 700_000, yieldPercent: 0.8 })],
      ]),
      recipes: new Map([
        ['r', recipe({ id: 'r', items: [{ id: 'l', ingredientId: 'i', quantity: 1000, unitId: 'u_g' }] })],
      ]),
    };
    const result = costRecipe('r', ctx);
    expect(result.ingredientCost).toBe('875000');
    // 175,000 of that is pure yield loss.
    expect(result.wasteAdjustment).toBe('175000');
  });

  it('refuses to convert across dimensions instead of guessing a density', () => {
    const ctx: EngineContext = {
      units: UNITS,
      ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 100 })]]),
      recipes: new Map([
        ['r', recipe({ id: 'r', items: [{ id: 'l', ingredientId: 'i', quantity: 100, unitId: 'u_ml' }] })],
      ]),
    };
    expect(() => costRecipe('r', ctx)).toThrow(/Cannot convert/);
  });
});

// ── sub-recipes ──────────────────────────────────────────────────────────────

describe('nested sub-recipes', () => {
  const ctx: EngineContext = {
    units: UNITS,
    ingredients: new Map([
      ['i_mayo', ingredient({ id: 'i_mayo', purchaseUnitPrice: 200_000 })],   // 200/g
      ['i_ketchup', ingredient({ id: 'i_ketchup', purchaseUnitPrice: 100_000 })], // 100/g
      ['i_beef', ingredient({ id: 'i_beef', purchaseUnitPrice: 1_000_000 })], // 1000/g
      ['i_bun', ingredient({
        id: 'i_bun', purchaseUnitPrice: 20_000,
        purchaseUnitId: 'u_piece', recipeUnitId: 'u_piece', conversionFactor: 1,
      })],
    ]),
    recipes: new Map([
      // Sauce batch: 800 g mayo + 200 g ketchup = 160,000 + 20,000 = 180,000
      // yielding 1000 g → 180 per gram.
      ['r_sauce', recipe({
        id: 'r_sauce', type: 'SUB_RECIPE', yieldQuantity: 1000, yieldUnitId: 'u_g',
        prepTimeMinutes: 10,
        items: [
          { id: 's1', ingredientId: 'i_mayo', quantity: 800, unitId: 'u_g' },
          { id: 's2', ingredientId: 'i_ketchup', quantity: 200, unitId: 'u_g' },
        ],
      })],
      // Burger: 150 g beef (150,000) + 1 bun (20,000) + 30 g sauce (5,400)
      ['r_burger', recipe({
        id: 'r_burger', prepTimeMinutes: 5, cookTimeMinutes: 6,
        items: [
          { id: 'b1', ingredientId: 'i_beef', quantity: 150, unitId: 'u_g' },
          { id: 'b2', ingredientId: 'i_bun', quantity: 1, unitId: 'u_piece' },
          { id: 'b3', subRecipeId: 'r_sauce', quantity: 30, unitId: 'u_g' },
        ],
      })],
    ]),
  };

  it('costs a batch sub-recipe per yield unit', () => {
    expect(costRecipe('r_sauce', ctx).totalCost).toBe('180');
  });

  it('rolls a sub-recipe into its parent at the right unit cost', () => {
    const result = costRecipe('r_burger', ctx);
    expect(result.ingredientCost).toBe('170000'); // beef + bun
    expect(result.subRecipeCost).toBe('5400');    // 30 g × 180
    expect(result.totalCost).toBe('175400');
  });

  it('includes sub-recipe prep time in the parent labor minutes', () => {
    // burger 5+6, sauce 10
    expect(costRecipe('r_burger', ctx).laborMinutes).toBe(21);
  });

  it('keeps the nested breakdown for the cost explanation view', () => {
    const line = costRecipe('r_burger', ctx).lines.find((l) => l.kind === 'SUB_RECIPE')!;
    expect(line.children).toHaveLength(2);
    expect(line.children!.map((c) => c.refId)).toEqual(['i_mayo', 'i_ketchup']);
  });

  it('detects a circular sub-recipe reference and names the chain', () => {
    const cyclic: EngineContext = {
      units: UNITS,
      ingredients: new Map(),
      recipes: new Map([
        ['a', recipe({ id: 'a', items: [{ id: '1', subRecipeId: 'b', quantity: 1, unitId: 'u_g' }] })],
        ['b', recipe({ id: 'b', items: [{ id: '2', subRecipeId: 'a', quantity: 1, unitId: 'u_g' }] })],
      ]),
    };
    expect(() => costRecipe('a', cyclic)).toThrow(CostEngineError);
    expect(() => costRecipe('a', cyclic)).toThrow(/Circular sub-recipe reference: a → b → a/);
  });
});

// ── recipe yield & scaling ───────────────────────────────────────────────────

describe('recipe yield and portioning', () => {
  const base = (over: Partial<EngineRecipe>) => ({
    units: UNITS,
    ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 1_000_000 })]]),
    recipes: new Map([
      ['r', recipe({
        id: 'r',
        items: [{ id: 'l', ingredientId: 'i', quantity: 1000, unitId: 'u_g' }],
        ...over,
      })],
    ]),
  }) as EngineContext;

  it('divides cost across the portions one execution yields', () => {
    expect(costRecipe('r', base({ yieldQuantity: 4 })).totalCost).toBe('250000');
  });

  it('raises per-portion cost when cooking loss shrinks the output', () => {
    // 1,000,000 of input surviving at 80% → 1,250,000 of usable product.
    expect(costRecipe('r', base({ recipeYieldPercent: 0.8 })).totalCost).toBe('1250000');
  });

  it('compounds preparation loss with cooking yield', () => {
    // surviving fraction = 0.9 × (1 - 0.1) = 0.81
    const r = costRecipe('r', base({ recipeYieldPercent: 0.9, preparationLossPercent: 0.1 }));
    expect(r.totalCost).toBe(d(1_000_000).dividedBy(0.81).toDecimalPlaces(4).toFixed());
  });

  it('rejects an impossible yield rather than producing a negative cost', () => {
    expect(() => costRecipe('r', base({ recipeYieldPercent: 0 }))).toThrow(/impossible effective yield/);
    expect(() => costRecipe('r', base({ yieldQuantity: 0 }))).toThrow(/positive quantity/);
  });
});

// ── pricing strategies ───────────────────────────────────────────────────────

describe('pricing strategies', () => {
  const cost = { totalCost: d(345_000), ingredientCost: d(280_000) };

  it('TARGET_GROSS_MARGIN divides by (1 - margin)', () => {
    const p = { ...PROFILE, pricingStrategy: 'TARGET_GROSS_MARGIN' as const, targetGrossMargin: 0.4 };
    expect(recommendPrice(p, cost).raw.toFixed()).toBe('575000');
  });

  it('TARGET_FOOD_COST divides ingredient cost by the target percentage', () => {
    const p = { ...PROFILE, pricingStrategy: 'TARGET_FOOD_COST' as const, targetFoodCostPct: 0.35 };
    expect(recommendPrice(p, cost).raw.toFixed()).toBe('800000');
  });

  it('COST_PLUS_MARKUP multiplies total cost', () => {
    const p = { ...PROFILE, pricingStrategy: 'COST_PLUS_MARKUP' as const, markupMultiplier: 2.5 };
    expect(recommendPrice(p, cost).raw.toFixed()).toBe('862500');
  });

  it('FIXED_PROFIT adds a flat amount', () => {
    const p = { ...PROFILE, pricingStrategy: 'FIXED_PROFIT' as const, fixedDesiredProfit: 155_000 };
    expect(recommendPrice(p, cost).raw.toFixed()).toBe('500000');
  });

  it('rejects a 100% target margin instead of dividing by zero', () => {
    const p = { ...PROFILE, targetGrossMargin: 1 };
    expect(() => recommendPrice(p, cost)).toThrow(/targetGrossMargin/);
  });
});

describe('price rounding', () => {
  it('always rounds up so the target margin is never undercut', () => {
    expect(applyRounding(d(492_857), 'NEAREST_1000').toFixed()).toBe('493000');
    expect(applyRounding(d(492_857), 'NEAREST_5000').toFixed()).toBe('495000');
    expect(applyRounding(d(492_857), 'NEAREST_10000').toFixed()).toBe('500000');
    expect(applyRounding(d(492_857), 'NONE').toFixed()).toBe('492857');
  });

  it('leaves an exact multiple untouched', () => {
    expect(applyRounding(d(495_000), 'NEAREST_5000').toFixed()).toBe('495000');
  });
});

// ── labor & overhead methods ─────────────────────────────────────────────────

describe('configurable labor and overhead allocation', () => {
  const ctx: EngineContext = {
    units: UNITS,
    ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 100_000 })]]),
    recipes: new Map([
      ['r', recipe({
        id: 'r', prepTimeMinutes: 10, cookTimeMinutes: 5,
        items: [{ id: 'l', ingredientId: 'i', quantity: 1000, unitId: 'u_g' }],
      })],
    ]),
  };
  const item = {
    id: 'm', name: 'x', namePersian: 'x', recipeId: 'r',
    sellingPrice: 200_000, priceIsOverridden: true,
  };

  it('PERCENT_OF_REVENUE labor scales with the selling price', () => {
    const p = { ...PROFILE, laborMethod: 'PERCENT_OF_REVENUE' as const, laborPercentOfRevenue: 0.2 };
    expect(costMenuItem(item, p, ctx).laborCost).toBe('40000');
  });

  it('PERCENT_OF_FOOD_COST overhead scales with the ingredient cost', () => {
    const p = {
      ...PROFILE,
      overheadMethod: 'PERCENT_OF_FOOD_COST' as const,
      overheadPercentOfFoodCost: 0.25,
    };
    expect(costMenuItem(item, p, ctx).overheadCost).toBe('25000');
  });

  it('PER_LABOR_MINUTE overhead scales with time in the kitchen', () => {
    const p = {
      ...PROFILE,
      overheadMethod: 'PER_LABOR_MINUTE' as const,
      overheadPerLaborMinute: 500,
    };
    expect(costMenuItem(item, p, ctx).overheadCost).toBe('7500'); // 15 × 500
  });

  it('NONE disables the allocation entirely', () => {
    const p = { ...PROFILE, laborMethod: 'NONE' as const, overheadMethod: 'NONE' as const };
    const r = costMenuItem(item, p, ctx);
    expect(r.laborCost).toBe('0');
    expect(r.overheadCost).toBe('0');
    expect(r.totalCost).toBe('100000');
  });

  it('converges on a price when overhead itself depends on the price', () => {
    // Without a stored price this is self-referential: price → overhead → cost → price.
    const p: EngineCostingProfile = {
      ...PROFILE,
      overheadMethod: 'PERCENT_OF_REVENUE',
      overheadPercentOfRevenue: 0.15,
      laborMethod: 'NONE',
      roundingRule: 'NONE',
    };
    const r = costMenuItem(
      { id: 'm', name: 'x', namePersian: 'x', recipeId: 'r', priceIsOverridden: false },
      p,
      ctx,
    );
    // Fixed point: price = (100,000 + 0.15·price)/0.7 ⇒ price ≈ 181,818.18
    expect(Number(r.sellingPrice)).toBeCloseTo(181_818.18, 0);
    // And the achieved margin still hits the 30% target.
    expect(Number(r.grossMarginPct)).toBeCloseTo(0.3, 3);
  });
});

// ── margin guards ────────────────────────────────────────────────────────────

describe('margin guard rails', () => {
  const ctx: EngineContext = {
    units: UNITS,
    ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 1_000_000 })]]),
    recipes: new Map([
      ['r', recipe({ id: 'r', items: [{ id: 'l', ingredientId: 'i', quantity: 1000, unitId: 'u_g' }] })],
    ]),
  };

  it('flags an item priced below the minimum acceptable margin', () => {
    const r = costMenuItem(
      { id: 'm', name: 'x', namePersian: 'x', recipeId: 'r', sellingPrice: 1_100_000, priceIsOverridden: true },
      { ...PROFILE, laborMethod: 'NONE', overheadMethod: 'NONE', minimumMargin: 0.2 },
      ctx,
    );
    expect(r.isBelowMinimumMargin).toBe(true);
    expect(r.isUnprofitable).toBe(false);
  });

  it('flags an item that loses money', () => {
    const r = costMenuItem(
      { id: 'm', name: 'x', namePersian: 'x', recipeId: 'r', sellingPrice: 900_000, priceIsOverridden: true },
      { ...PROFILE, laborMethod: 'NONE', overheadMethod: 'NONE' },
      ctx,
    );
    expect(r.isUnprofitable).toBe(true);
    expect(Number(r.grossProfit)).toBeLessThan(0);
  });

  it('never returns Infinity for a zero-priced item', () => {
    const r = costMenuItem(
      { id: 'm', name: 'x', namePersian: 'x', recipeId: 'r', sellingPrice: 0, priceIsOverridden: true },
      PROFILE,
      ctx,
    );
    expect(r.grossMarginPct).toBe('0');
    expect(r.foodCostPct).toBe('0');
  });
});

// ── tax ──────────────────────────────────────────────────────────────────────

describe('configurable tax', () => {
  const ctx: EngineContext = {
    units: UNITS,
    ingredients: new Map([['i', ingredient({ id: 'i', purchaseUnitPrice: 100_000 })]]),
    recipes: new Map([
      ['r', recipe({ id: 'r', items: [{ id: 'l', ingredientId: 'i', quantity: 1000, unitId: 'u_g' }] })],
    ]),
  };
  const item = { id: 'm', name: 'x', namePersian: 'x', recipeId: 'r', sellingPrice: 109_000, priceIsOverridden: true };

  it('extracts tax from a tax-inclusive menu price', () => {
    const r = costMenuItem(item, { ...PROFILE, taxRate: 0.09, taxInclusive: true }, ctx);
    expect(r.priceExcludingTax).toBe('100000');
    expect(r.taxAmount).toBe('9000');
  });

  it('adds tax on top of a tax-exclusive price', () => {
    const r = costMenuItem(item, { ...PROFILE, taxRate: 0.09, taxInclusive: false }, ctx);
    expect(r.priceExcludingTax).toBe('109000');
    expect(r.taxAmount).toBe('9810');
  });
});
