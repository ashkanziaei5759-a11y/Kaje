import { describe, it, expect } from 'vitest';
import { d } from '../src/lib/money';
import {
  applyReceipt, applyIssue, applyCount, applyMovement,
  mergeDepletion, stockStatus, portionsAvailable, valuation, InventoryError,
} from '../src/lib/engine/inventory-engine';

const pos = (quantity: number, avgUnitCost: number) => ({
  quantity: d(quantity),
  avgUnitCost: d(avgUnitCost),
});

describe('weighted-average receipts', () => {
  it('sets the average from the first receipt', () => {
    const r = applyReceipt(pos(0, 0), 10_000, 850);
    expect(r.position.quantity.toFixed()).toBe('10000');
    expect(r.position.avgUnitCost.toFixed()).toBe('850');
    expect(r.totalCost.toFixed()).toBe('8500000');
  });

  it('blends a more expensive second delivery into the average', () => {
    // 10,000 g @ 850 then 10,000 g @ 950 → 900
    const first = applyReceipt(pos(0, 0), 10_000, 850);
    const second = applyReceipt(first.position, 10_000, 950);
    expect(second.position.quantity.toFixed()).toBe('20000');
    expect(second.position.avgUnitCost.toFixed()).toBe('900');
  });

  it('weights the blend by quantity, not by delivery count', () => {
    // 9,000 @ 800 + 1,000 @ 1,800 → (7,200,000 + 1,800,000)/10,000 = 900
    const first = applyReceipt(pos(0, 0), 9_000, 800);
    const second = applyReceipt(first.position, 1_000, 1_800);
    expect(second.position.avgUnitCost.toFixed()).toBe('900');
  });

  it('takes the incoming price outright when stock was negative', () => {
    const r = applyReceipt(pos(-500, 800), 1_000, 1_000);
    expect(r.position.quantity.toFixed()).toBe('500');
    expect(r.position.avgUnitCost.toFixed()).toBe('1000');
  });

  it('rejects a non-positive or negatively priced receipt', () => {
    expect(() => applyReceipt(pos(0, 0), 0, 100)).toThrow(InventoryError);
    expect(() => applyReceipt(pos(0, 0), 10, -1)).toThrow(/negative/);
  });
});

describe('issues', () => {
  it('leaves at the current average without disturbing it', () => {
    const r = applyIssue(pos(10_000, 900), 2_500);
    expect(r.position.quantity.toFixed()).toBe('7500');
    expect(r.position.avgUnitCost.toFixed()).toBe('900');
    expect(r.totalCost.toFixed()).toBe('-2250000');
    expect(r.quantity.toFixed()).toBe('-2500');
  });

  it('allows stock to go negative but flags it', () => {
    const r = applyIssue(pos(100, 900), 250);
    expect(r.position.quantity.toFixed()).toBe('-150');
    expect(r.wentNegative).toBe(true);
  });

  it('does not re-flag an already-negative position', () => {
    expect(applyIssue(pos(-50, 900), 10).wentNegative).toBe(false);
  });
});

describe('stock counts', () => {
  it('books the difference at the standing average and keeps it', () => {
    const r = applyCount(pos(10_000, 900), 9_400);
    expect(r.quantity.toFixed()).toBe('-600');
    expect(r.totalCost.toFixed()).toBe('-540000');
    expect(r.position.avgUnitCost.toFixed()).toBe('900');
  });

  it('handles a count that finds more than expected', () => {
    expect(applyCount(pos(100, 50), 130).quantity.toFixed()).toBe('30');
  });

  it('refuses a negative physical count', () => {
    expect(() => applyCount(pos(100, 50), -1)).toThrow(/cannot be negative/);
  });
});

describe('applyMovement dispatch', () => {
  it('routes a purchase receipt through the averaging path', () => {
    const r = applyMovement(pos(1_000, 800), 'PURCHASE_RECEIPT', 1_000, { unitCost: 1_000 });
    expect(r.position.avgUnitCost.toFixed()).toBe('900');
  });

  it('routes a sale through the issue path', () => {
    const r = applyMovement(pos(1_000, 800), 'SALE_DEPLETION', 250);
    expect(r.position.quantity.toFixed()).toBe('750');
  });

  it('restores stock when a sale is reversed', () => {
    const sale = applyMovement(pos(1_000, 800), 'SALE_DEPLETION', 250);
    const back = applyMovement(sale.position, 'SALE_REVERSAL', 250, { unitCost: 800 });
    expect(back.position.quantity.toFixed()).toBe('1000');
    expect(back.position.avgUnitCost.toFixed()).toBe('800');
  });

  it('treats a signed adjustment in both directions', () => {
    expect(applyMovement(pos(100, 10), 'ADJUSTMENT', 50).position.quantity.toFixed()).toBe('150');
    expect(applyMovement(pos(100, 10), 'ADJUSTMENT', -30).position.quantity.toFixed()).toBe('70');
    expect(() => applyMovement(pos(100, 10), 'ADJUSTMENT', 0)).toThrow(/no effect/);
  });

  it('values waste at the average cost on hand', () => {
    const r = applyMovement(pos(1_000, 900), 'WASTE', 100);
    expect(r.totalCost.toFixed()).toBe('-90000');
  });
});

describe('recipe explosion', () => {
  it('merges repeated ingredient lines into a single movement', () => {
    const merged = mergeDepletion([
      { ingredientId: 'tomato', quantity: d(50) },
      { ingredientId: 'rice', quantity: d(300) },
      { ingredientId: 'tomato', quantity: d(30) },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((l) => l.ingredientId === 'tomato')!.quantity.toFixed()).toBe('80');
  });

  it('drops lines that cancel to zero', () => {
    // e.g. an "extra cheese" modifier undone by a "no cheese" one
    expect(mergeDepletion([
      { ingredientId: 'cheese', quantity: d(20) },
      { ingredientId: 'cheese', quantity: d(-20) },
    ])).toHaveLength(0);
  });

  it('scales the spec example: 10 kebabs deplete 2.5 kg chicken and 3 kg rice', () => {
    const perPortion = [
      { ingredientId: 'chicken', quantity: d(250) },
      { ingredientId: 'rice', quantity: d(300) },
    ];
    const merged = mergeDepletion(
      perPortion.map((l) => ({ ...l, quantity: l.quantity.times(10) })),
    );
    expect(merged[0].quantity.toFixed()).toBe('2500');
    expect(merged[1].quantity.toFixed()).toBe('3000');
  });
});

describe('stock status thresholds', () => {
  it('classifies against minimum and reorder levels', () => {
    expect(stockStatus(0, 500, 2_000)).toBe('OUT_OF_STOCK');
    expect(stockStatus(-10, 500, 2_000)).toBe('OUT_OF_STOCK');
    expect(stockStatus(400, 500, 2_000)).toBe('CRITICAL');
    expect(stockStatus(1_500, 500, 2_000)).toBe('LOW');
    expect(stockStatus(5_000, 500, 2_000)).toBe('OK');
  });
});

describe('portions available', () => {
  it('reports the scarcest ingredient as the limit', () => {
    const available = portionsAvailable(
      [
        { ingredientId: 'chicken', quantityPerPortion: d(250) },
        { ingredientId: 'rice', quantityPerPortion: d(300) },
      ],
      new Map([['chicken', d(2_500)], ['rice', d(900)]]),
    );
    expect(available).toBe(3); // rice allows only 3
  });

  it('returns zero when an ingredient is missing entirely', () => {
    expect(portionsAvailable(
      [{ ingredientId: 'saffron', quantityPerPortion: d(2) }],
      new Map(),
    )).toBe(0);
  });
});

describe('valuation', () => {
  it('totals quantity × average cost across positions', () => {
    expect(valuation([pos(10_000, 900), pos(500, 20_000)]).toFixed()).toBe('19000000');
  });
});
