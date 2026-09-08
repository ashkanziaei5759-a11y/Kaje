import { formatCurrency, formatPercent } from '@/lib/format';

export interface CostBarSegment {
  key: string;
  label: string;
  value: number;
  className: string;
}

/**
 * The cost decomposition bar.
 *
 * One horizontal bar per dish, splitting the selling price into the four cost
 * components plus the profit that is left. It is the visual answer to
 * «چرا این غذا این‌قدر هزینه دارد؟» — you can see at a glance whether a thin
 * margin is caused by ingredients, labour or overhead, which a single
 * "food cost %" figure never tells you.
 *
 * A loss renders differently on purpose: cost overflows the price, so the bar
 * shows the overrun in pomegranate rather than silently clipping it.
 */
export function CostBar({
  ingredientCost, subRecipeCost, laborCost, packagingCost, overheadCost,
  sellingPrice, symbol, showLegend = true, height = 'h-2.5',
}: {
  ingredientCost: string | number;
  subRecipeCost: string | number;
  laborCost: string | number;
  packagingCost: string | number;
  overheadCost: string | number;
  sellingPrice: string | number;
  symbol?: string;
  showLegend?: boolean;
  height?: string;
}) {
  const food = Number(ingredientCost) + Number(subRecipeCost);
  const labor = Number(laborCost);
  const packaging = Number(packagingCost);
  const overhead = Number(overheadCost);
  const price = Number(sellingPrice);
  const totalCost = food + labor + packaging + overhead;
  const profit = price - totalCost;
  const isLoss = profit < 0;

  // Scale against whichever is larger, so a loss-making dish visibly overruns.
  const scale = Math.max(price, totalCost) || 1;

  const segments: CostBarSegment[] = [
    { key: 'food', label: 'مواد اولیه', value: food, className: 'bg-ink-400' },
    { key: 'labor', label: 'نیروی کار', value: labor, className: 'bg-ink-600' },
    { key: 'packaging', label: 'بسته‌بندی', value: packaging, className: 'bg-ink-700' },
    { key: 'overhead', label: 'سربار', value: overhead, className: 'bg-ink-500' },
    isLoss
      ? { key: 'loss', label: 'زیان', value: -profit, className: 'bg-pomegranate-500' }
      : { key: 'profit', label: 'سود', value: profit, className: 'bg-saffron-400' },
  ];

  return (
    <div className="w-full">
      <div
        className={`flex w-full overflow-hidden rounded-full bg-ink-850 ${height}`}
        role="img"
        aria-label={
          `قیمت فروش ${formatCurrency(price)}، ` +
          `قیمت تمام‌شده ${formatCurrency(totalCost)}، ` +
          `${isLoss ? 'زیان' : 'سود'} ${formatCurrency(Math.abs(profit))}`
        }
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              className={`${s.className} transition-[width] duration-500`}
              style={{ width: `${(s.value / scale) * 100}%` }}
              title={`${s.label}: ${formatCurrency(s.value, { symbol })}`}
            />
          ))}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-2xs text-ink-400">
                <span className={`inline-block size-2 rounded-sm ${s.className}`} />
                {s.label}
                <span className="tabular text-ink-300">
                  {formatPercent(s.value / scale, { decimals: 0 })}
                </span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
