import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import {
  getSalesSummary, getItemPerformance, getExpenseSummary, getCostVariance,
  resolveRange, type RangePreset,
} from '@/server/services/reports';
import { getInventoryValuation } from '@/server/services/inventory';
import { PageHeader, KpiCard, Table, Badge } from '@/components/ui';
import { RangePicker } from '@/components/RangePicker';
import { ExportButtons } from '@/components/ExportButtons';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';

export const metadata = { title: 'گزارش‌ها' };
export const dynamic = 'force-dynamic';

const PRESETS: RangePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month'];

const CAUSE_LABELS: Record<string, string> = {
  WASTE: 'ضایعات ثبت‌شده',
  OVER_PORTIONING: 'پرس‌بندی بیش از دستور',
  SHRINKAGE: 'کسری یا سرقت',
  INCORRECT_RECIPE: 'دستور پخت نادرست',
  PRICE_INCREASE: 'افزایش قیمت خرید',
  INVENTORY_ERROR: 'خطای ثبت موجودی',
};

export default async function ReportsPage({
  searchParams,
}: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const preset = (PRESETS.includes(params.range as RangePreset) ? params.range : 'this_month') as RangePreset;
  const range = resolveRange(preset);

  const [restaurant, summary, items, expenses, variance, stockValue] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    getSalesSummary(user.restaurantId, range),
    getItemPerformance(user.restaurantId, range),
    getExpenseSummary(user.restaurantId, range),
    getCostVariance(user.restaurantId, range),
    getInventoryValuation(user.restaurantId),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const revenue = Number(summary.revenue);
  const netProfit = Number(summary.grossProfit) - Number(expenses.total);

  return (
    <>
      <PageHeader
        title="گزارش‌ها"
        subtitle={`${formatJalali(range.from)} تا ${formatJalali(range.to)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <RangePicker current={preset} />
            <ExportButtons range={preset} />
          </div>
        }
      />

      {/* Profit & loss */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-ink-100">صورت سود و زیان</h2>
        <dl className="mt-4 space-y-1">
          <PLRow label="فروش خالص" value={summary.revenue} symbol={symbol} share={1} bold />
          <PLRow label="هزینه مواد اولیه" value={`-${summary.foodCost}`} symbol={symbol}
            share={revenue > 0 ? -Number(summary.foodCost) / revenue : 0} />
          <PLRow label="هزینه مستقیم نیروی کار" value={`-${summary.laborCost}`} symbol={symbol}
            share={revenue > 0 ? -Number(summary.laborCost) / revenue : 0} />
          <PLRow label="سربار تخصیص‌یافته" value={`-${summary.overheadCost}`} symbol={symbol}
            share={revenue > 0 ? -Number(summary.overheadCost) / revenue : 0} />
          <PLRow label="سود ناخالص" value={summary.grossProfit} symbol={symbol}
            share={Number(summary.grossMarginPct)} bold divider />
          <PLRow label="هزینه‌های عملیاتی دوره" value={`-${expenses.total}`} symbol={symbol}
            share={revenue > 0 ? -Number(expenses.total) / revenue : 0} />
          <PLRow label="سود خالص" value={String(netProfit)} symbol={symbol}
            share={revenue > 0 ? netProfit / revenue : 0} bold divider />
        </dl>
        <p className="mt-3 text-2xs leading-6 text-ink-500">
          هزینه مواد اولیه و نیروی کار از «عکس لحظه‌ای هزینه» هر فروش خوانده می‌شود، نه از
          قیمت‌های امروز — بنابراین سود دوره‌های گذشته با تغییر قیمت مواد اولیه تغییر نمی‌کند.
        </p>
      </section>

      {/* Actual vs theoretical */}
      <section className="mt-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-100">
          قیمت تمام‌شده واقعی در برابر تئوریک
        </h2>
        <p className="mb-3 text-2xs text-ink-500">
          تئوریک: آنچه دستور پخت‌ها می‌گویند باید مصرف شده باشد. واقعی: موجودی اول دوره + خرید −
          موجودی پایان دوره. اختلاف این دو، چیزی است که بدون ثبت از انبار خارج شده.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="هزینه تئوریک" value={formatCurrency(variance.theoreticalCost, { symbol, compact: true })}
            sub={`${formatPercent(variance.theoreticalFoodCostPct)} از فروش`} />
          <KpiCard label="هزینه واقعی" value={formatCurrency(variance.actualCost, { symbol, compact: true })}
            sub={`${formatPercent(variance.actualFoodCostPct)} از فروش`} />
          <KpiCard
            label="انحراف" value={formatCurrency(variance.variance, { symbol, compact: true })}
            tone={variance.severity === 'CRITICAL' ? 'negative' : variance.severity === 'WATCH' ? 'warning' : 'positive'}
            sub={formatPercent(variance.variancePct, { sign: true })}
          />
          <KpiCard
            label="انحراف توضیح‌داده‌نشده"
            value={formatCurrency(variance.unexplainedVariance, { symbol, compact: true })}
            tone={Number(variance.unexplainedVariance) > 0 ? 'negative' : 'positive'}
            sub={`پس از کسر ${formatCurrency(variance.recordedWaste, { compact: true })} ضایعات ثبت‌شده`}
          />
        </div>

        {variance.likelyCauses.length > 0 && (
          <div className="mt-3 card p-4">
            <p className="label mb-2">علل محتمل</p>
            <div className="flex flex-wrap gap-2">
              {variance.likelyCauses.map((cause) => (
                <Badge key={cause} tone="warning">{CAUSE_LABELS[cause] ?? cause}</Badge>
              ))}
            </div>
            <p className="mt-3 text-2xs leading-6 text-ink-500">
              انحراف مثبت یعنی بیش از آنچه دستور پخت‌ها توضیح می‌دهند از انبار خارج شده.
              انحراف منفی معمولاً نشانه خطای داده است، نه صرفه‌جویی.
            </p>
          </div>
        )}
      </section>

      {/* Item profitability */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-100">سودآوری آیتم‌ها</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-800">
              <th className="th">آیتم</th>
              <th className="th">تعداد</th>
              <th className="th">فروش</th>
              <th className="th">قیمت تمام‌شده</th>
              <th className="th">سود</th>
              <th className="th">حاشیه</th>
              <th className="th">سهم از فروش</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-850">
            {items.map((item) => (
              <tr key={item.menuItemId}>
                <td className="td">{item.namePersian}</td>
                <td className="td tabular">{faDigits(item.unitsSold)}</td>
                <td className="td tabular">{formatCurrency(item.revenue, { compact: true })}</td>
                <td className="td tabular text-ink-400">{formatCurrency(item.cost, { compact: true })}</td>
                <td className={`td tabular ${Number(item.profit) > 0 ? 'text-pistachio-400' : 'text-pomegranate-400'}`}>
                  {formatCurrency(item.profit, { compact: true })}
                </td>
                <td className="td tabular">{formatPercent(item.marginPct)}</td>
                <td className="td tabular text-ink-500">
                  {formatPercent(revenue > 0 ? Number(item.revenue) / revenue : 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="mt-6 grid lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-ink-100">ارزش‌گذاری انبار</h2>
          <p className="mt-3 text-2xl font-bold tabular text-ink-50">
            {formatCurrency(stockValue.toFixed(), { symbol })}
          </p>
          <p className="mt-1 text-2xs text-ink-500">بر پایه میانگین موزون قیمت خرید</p>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-ink-100">شاخص‌های کلیدی</h2>
          <dl className="mt-3 space-y-2 text-2xs">
            <Kv label="درصد مواد اولیه" value={formatPercent(summary.foodCostPct)} />
            <Kv label="درصد نیروی کار" value={formatPercent(summary.laborCostPct)} />
            <Kv label="هزینه اولیه (Prime)" value={formatPercent(summary.primeCostPct)} />
            <Kv label="حاشیه سود ناخالص" value={formatPercent(summary.grossMarginPct)} />
            <Kv label="میانگین ارزش سفارش" value={formatCurrency(summary.averageOrderValue, { symbol })} />
            <Kv label="تعداد سفارش" value={faDigits(summary.orderCount)} />
          </dl>
        </div>
      </section>
    </>
  );
}

function PLRow({
  label, value, symbol, share, bold, divider,
}: {
  label: string; value: string; symbol: string; share: number;
  bold?: boolean; divider?: boolean;
}) {
  const n = Number(value);
  return (
    <div className={`flex items-center justify-between gap-4 py-1.5 ${divider ? 'border-t border-ink-800 mt-1 pt-2.5' : ''}`}>
      <dt className={`text-2xs ${bold ? 'font-semibold text-ink-100' : 'text-ink-400'}`}>{label}</dt>
      <dd className="flex items-baseline gap-4">
        <span className={`tabular text-2xs w-14 text-left ${share < 0 ? 'text-ink-600' : 'text-ink-500'}`}>
          {formatPercent(share, { decimals: 1 })}
        </span>
        <span className={`tabular w-32 text-left ${
          bold ? 'text-base font-bold' : 'text-sm'
        } ${n < 0 ? 'text-pomegranate-400' : bold ? 'text-ink-50' : 'text-ink-200'}`}>
          {formatCurrency(Math.abs(n), { symbol: bold ? symbol : undefined, compact: true })}
        </span>
      </dd>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular text-ink-200">{value}</dd>
    </div>
  );
}
