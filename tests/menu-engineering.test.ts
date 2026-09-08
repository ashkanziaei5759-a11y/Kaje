import { describe, it, expect } from 'vitest';
import { analyseMenu, analyseVariance } from '../src/lib/engine/menu-engineering';

const item = (id: string, unitsSold: number, sellingPrice: number, totalCost: number) => ({
  menuItemId: id, name: id, namePersian: id, unitsSold, sellingPrice, totalCost,
});

describe('menu engineering classification', () => {
  // 4 items → even share 25%, popularity line at 0.7 × 25% = 17.5%
  const report = analyseMenu([
    item('star', 500, 500_000, 300_000),      // popular, CM 200,000
    item('plowhorse', 450, 300_000, 240_000), // popular, CM  60,000
    item('puzzle', 40, 800_000, 400_000),     // rare,    CM 400,000
    item('dog', 30, 200_000, 170_000),        // rare,    CM  30,000
  ]);

  const by = (id: string) => report.items.find((i) => i.menuItemId === id)!;

  it('places each item in the right quadrant', () => {
    expect(by('star').classification).toBe('STAR');
    expect(by('plowhorse').classification).toBe('PLOWHORSE');
    expect(by('puzzle').classification).toBe('PUZZLE');
    expect(by('dog').classification).toBe('DOG');
    expect(report.counts).toEqual({ STAR: 1, PLOWHORSE: 1, PUZZLE: 1, DOG: 1 });
  });

  it('sets the popularity line at 0.7 / item_count', () => {
    expect(Number(report.popularityThreshold)).toBeCloseTo(0.175, 6);
  });

  it('weights the average contribution margin by units sold', () => {
    // (500·200k + 450·60k + 40·400k + 30·30k) / 1020
    const expected = (500 * 200_000 + 450 * 60_000 + 40 * 400_000 + 30 * 30_000) / 1020;
    expect(Number(report.averageContributionMargin)).toBeCloseTo(expected, 2);
  });

  it('totals revenue, cost and profit across the menu', () => {
    expect(report.totalRevenue).toBe('423000000');
    expect(report.totalUnitsSold).toBe(1020);
    expect(Number(report.totalProfit)).toBe(
      Number(report.totalRevenue) - Number(report.totalCost),
    );
  });

  it('gives each quadrant an actionable recommendation', () => {
    expect(by('star').recommendations).toEqual(['KEEP', 'PROMOTE']);
    expect(by('plowhorse').recommendations).toEqual(['REDUCE_COST', 'INCREASE_PRICE']);
    expect(by('puzzle').recommendations).toEqual(['PROMOTE', 'REPOSITION']);
    expect(by('dog').recommendations).toEqual(['REMOVE', 'REPOSITION']);
  });

  it('recommends removing an unpopular loss-maker outright', () => {
    const r = analyseMenu([
      item('good', 900, 500_000, 200_000),
      item('bleeding', 5, 100_000, 160_000),
    ]);
    expect(r.items.find((i) => i.menuItemId === 'bleeding')!.recommendations).toEqual(['REMOVE']);
  });

  it('handles an empty menu without dividing by zero', () => {
    const r = analyseMenu([]);
    expect(r.totalUnitsSold).toBe(0);
    expect(r.averageContributionMargin).toBe('0');
    expect(r.items).toEqual([]);
  });

  it('handles a menu that sold nothing at all', () => {
    const r = analyseMenu([item('a', 0, 100_000, 50_000)]);
    expect(r.items[0].popularityPct).toBe('0');
    expect(r.totalRevenue).toBe('0');
  });
});

describe('actual vs theoretical food cost', () => {
  it('reproduces the spec example: 250M theoretical vs 280M actual', () => {
    const r = analyseVariance({
      theoreticalCost: 250_000_000,
      openingInventory: 100_000_000,
      purchases: 300_000_000,
      closingInventory: 120_000_000,
      recordedWaste: 8_000_000,
      revenue: 900_000_000,
    });
    expect(r.actualCost).toBe('280000000');   // 100M + 300M - 120M
    expect(r.variance).toBe('30000000');      // +30M
    expect(Number(r.variancePct)).toBeCloseTo(0.12, 6);
    expect(r.severity).toBe('CRITICAL');
  });

  it('separates recorded waste from unexplained loss', () => {
    const r = analyseVariance({
      theoreticalCost: 250_000_000,
      openingInventory: 100_000_000,
      purchases: 300_000_000,
      closingInventory: 120_000_000,
      recordedWaste: 8_000_000,
      revenue: 900_000_000,
    });
    expect(r.unexplainedVariance).toBe('22000000');
    expect(r.likelyCauses).toContain('WASTE');
    expect(r.likelyCauses).toContain('SHRINKAGE');
    expect(r.likelyCauses).toContain('OVER_PORTIONING');
  });

  it('expresses both costs as a share of revenue', () => {
    const r = analyseVariance({
      theoreticalCost: 250_000_000, openingInventory: 100_000_000,
      purchases: 300_000_000, closingInventory: 120_000_000,
      recordedWaste: 0, revenue: 1_000_000_000,
    });
    expect(Number(r.theoreticalFoodCostPct)).toBeCloseTo(0.25, 6);
    expect(Number(r.actualFoodCostPct)).toBeCloseTo(0.28, 6);
  });

  it('treats a negative variance as a data problem, not a win', () => {
    const r = analyseVariance({
      theoreticalCost: 300_000_000, openingInventory: 100_000_000,
      purchases: 250_000_000, closingInventory: 100_000_000,
      recordedWaste: 0, revenue: 900_000_000,
    });
    expect(Number(r.variance)).toBeLessThan(0);
    expect(r.likelyCauses).toEqual(['INCORRECT_RECIPE', 'INVENTORY_ERROR']);
  });

  it('grades severity by size of the gap', () => {
    const at = (actualPurchases: number) => analyseVariance({
      theoreticalCost: 100_000_000, openingInventory: 0,
      purchases: actualPurchases, closingInventory: 0,
      recordedWaste: 0, revenue: 400_000_000,
    }).severity;
    expect(at(101_000_000)).toBe('OK');        // +1%
    expect(at(105_000_000)).toBe('WATCH');     // +5%
    expect(at(115_000_000)).toBe('CRITICAL');  // +15%
  });
});
