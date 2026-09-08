import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { getDashboard, getDailySeries, resolveRange, type RangePreset } from '@/server/services/reports';
import { KpiCard, Badge, PageHeader, Money, Percent, Table, Num } from '@/components/ui';
import { RangePicker } from '@/components/RangePicker';
import { RevenueChart } from '@/components/RevenueChart';
import { formatCurrency, formatPercent } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';

export const metadata = { title: 'داشبورد' };
export const dynamic = 'force-dynamic';

const PRESETS: RangePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month'];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const preset = (PRESETS.includes(params.range as RangePreset) ? params.range : 'this_month') as RangePreset;
  const range =
    params.from && params.to
      ? { from: new Date(params.from), to: new Date(params.to) }
      : resolveRange(preset);

  const [restaurant, data, series, profile] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    getDashboard(user.restaurantId, range),
    getDailySeries(user.restaurantId, range),
    // Targets are a business decision, not a constant. They come from the
    // restaurant's costing profile so the dashboard measures against what this
    // restaurant actually aims for.
    prisma.costingProfile.findFirst({
      where: { restaurantId: user.restaurantId, isDefault: true },
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const { summary } = data;

  const targetFoodCost = Number(profile?.targetFoodCostPct ?? 0.3);
  const targetMargin = Number(profile?.targetGrossMargin ?? 0.3);
  // Prime cost is the sum of the two ratios the restaurant manages directly.
  const targetPrime = targetFoodCost + Number(profile?.laborPercentOfRevenue ?? 0.2);

  return (
    <>
      <PageHeader
        title={`سلام، ${user.name.split(' ')[0]}`}
        subtitle={`${formatJalali(range.from)} تا ${formatJalali(range.to)}`}
        action={<RangePicker current={preset} />}
      />

      {/* Headline figures — money in, money out, what is left. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="فروش دوره" tone="default"
          value={formatCurrency(summary.revenue, { symbol, compact: true })}
          sub={<>{formatCurrency(summary.averageOrderValue, { compact: true })} میانگین هر سفارش</>}
        />
        <KpiCard
          label="سود ناخالص"
          tone={Number(summary.grossMarginPct) >= targetMargin ? 'positive' : 'warning'}
          value={formatCurrency(summary.grossProfit, { symbol, compact: true })}
          sub={<>حاشیه {formatPercent(summary.grossMarginPct)} — هدف {formatPercent(targetMargin, { decimals: 0 })}</>}
        />
        <KpiCard
          label="سود خالص" tone={Number(data.netProfit) >= 0 ? 'positive' : 'negative'}
          value={formatCurrency(data.netProfit, { symbol, compact: true })}
          sub={
            <>
              پس از کسر {formatCurrency(data.expenses.total, { compact: true })} هزینه
              {preset === 'this_month' && ' (هزینه‌های ثابت ماه کامل ثبت شده‌اند)'}
            </>
          }
        />
        <KpiCard
          label="تعداد فروش" tone="accent"
          value={<Num>{summary.unitsSold}</Num>}
          sub={<><Num>{summary.orderCount}</Num> سفارش</>}
        />
      </div>

      {/* The three ratios a restaurant is actually run on. */}
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="درصد مواد اولیه" value={formatPercent(summary.foodCostPct)}
          tone={Number(summary.foodCostPct) > targetFoodCost ? 'warning' : 'positive'}
          sub={<>هدف: زیر {formatPercent(targetFoodCost, { decimals: 0 })}</>}
        />
        <KpiCard
          label="درصد نیروی کار" value={formatPercent(summary.laborCostPct)}
          tone="default"
          sub={<>سهم نیروی کار از فروش</>}
        />
        <KpiCard
          label="هزینه اولیه (Prime)" value={formatPercent(summary.primeCostPct)}
          tone={Number(summary.primeCostPct) > targetPrime ? 'warning' : 'positive'}
          sub={<>مواد اولیه + نیروی کار</>}
        />
        <KpiCard
          label="ارزش موجودی انبار"
          value={formatCurrency(data.inventoryValue, { symbol, compact: true })}
          sub={<>ضایعات دوره: {formatCurrency(Math.abs(Number(data.wasteCost)), { compact: true })}</>}
          href="/inventory"
        />
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink-100">فروش، هزینه و سود روزانه</h2>
            <Badge tone="neutral">{formatJalali(range.from, 'short')} — {formatJalali(range.to, 'short')}</Badge>
          </div>
          <RevenueChart data={series} />
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-100 mb-3">هشدارها</h2>
          {data.alerts.length === 0 ? (
            <p className="text-2xs text-ink-500 py-6 text-center">هشدار باز وجود ندارد.</p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {data.alerts.map((alert) => (
                <li key={alert.id} className="rounded-lg border border-ink-800 bg-ink-850 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-2xs font-semibold text-ink-100">{alert.title}</p>
                    <Badge tone={alert.severity === 'CRITICAL' ? 'negative' : 'warning'}>
                      {alert.severity === 'CRITICAL' ? 'بحرانی' : 'هشدار'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-2xs leading-5 text-ink-400">{alert.message}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        <RankedList
          title="پرفروش‌ترین‌ها"
          rows={data.bestSellers.map((i) => ({
            id: i.menuItemId, name: i.namePersian,
            primary: `${i.unitsSold.toLocaleString('fa-IR')} پرس`,
            secondary: formatCurrency(i.revenue, { compact: true }),
          }))}
        />
        <RankedList
          title="سودآورترین‌ها"
          rows={data.mostProfitable.map((i) => ({
            id: i.menuItemId, name: i.namePersian,
            primary: formatCurrency(i.profit, { compact: true }),
            secondary: formatPercent(i.marginPct),
            tone: 'positive' as const,
          }))}
        />
        <RankedList
          title="کم‌حاشیه‌ترین‌ها"
          hint="این آیتم‌ها به بازبینی قیمت یا دستور پخت نیاز دارند"
          rows={data.lowestMargin.map((i) => ({
            id: i.menuItemId, name: i.namePersian,
            primary: formatPercent(i.marginPct),
            secondary: `${i.unitsSold.toLocaleString('fa-IR')} پرس`,
            tone: (Number(i.marginPct) <= 0 ? 'negative' : 'warning') as 'negative' | 'warning',
          }))}
        />
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-ink-100">موجودی رو به اتمام</h2>
            <Link href="/inventory" className="text-2xs text-saffron-400 hover:underline">همه</Link>
          </div>
          {data.outOfStock.length + data.lowStock.length === 0 ? (
            <div className="card p-6 text-center text-2xs text-ink-500">
              همه مواد اولیه بالای حد سفارش هستند.
            </div>
          ) : (
            <Table>
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">ماده اولیه</th>
                  <th className="th">موجودی</th>
                  <th className="th">حد سفارش</th>
                  <th className="th">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-850">
                {[...data.outOfStock, ...data.lowStock].slice(0, 8).map((row) => (
                  <tr key={row.ingredientId}>
                    <td className="td">{row.namePersian}</td>
                    <td className="td tabular">
                      <Num>{Math.round(Number(row.quantity))}</Num>{' '}
                      <span className="text-ink-500">{row.recipeUnit}</span>
                    </td>
                    <td className="td tabular text-ink-400">
                      <Num>{Math.round(Number(row.reorderLevel))}</Num>
                    </td>
                    <td className="td">
                      <Badge tone={row.status === 'OUT_OF_STOCK' ? 'negative' : row.status === 'CRITICAL' ? 'negative' : 'warning'}>
                        {row.status === 'OUT_OF_STOCK' ? 'ناموجود' : row.status === 'CRITICAL' ? 'بحرانی' : 'کم'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink-100 mb-2">افزایش قیمت مواد اولیه</h2>
          {data.priceIncreases.length === 0 ? (
            <div className="card p-6 text-center text-2xs text-ink-500">
              در این دوره افزایش قیمتی ثبت نشده است.
            </div>
          ) : (
            <Table>
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">ماده اولیه</th>
                  <th className="th">قیمت قبلی</th>
                  <th className="th">قیمت جدید</th>
                  <th className="th">تغییر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-850">
                {data.priceIncreases.map((row, index) => (
                  <tr key={index}>
                    <td className="td">{row.ingredient}</td>
                    <td className="td tabular text-ink-400">
                      {row.previousPrice ? formatCurrency(row.previousPrice, { compact: true }) : '—'}
                    </td>
                    <td className="td tabular">{formatCurrency(row.price, { compact: true })}</td>
                    <td className="td">
                      <span className="tabular text-pomegranate-400">
                        {row.changePercent ? formatPercent(row.changePercent, { sign: true }) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <section>
          <h2 className="text-sm font-semibold text-ink-100 mb-2">آخرین خریدها</h2>
          <Table>
            <thead>
              <tr className="border-b border-ink-800">
                <th className="th">فاکتور</th>
                <th className="th">تأمین‌کننده</th>
                <th className="th">تاریخ</th>
                <th className="th">مبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-850">
              {data.recentPurchases.map((p) => (
                <tr key={p.id}>
                  <td className="td text-ink-400" dir="ltr">{p.invoiceNumber ?? '—'}</td>
                  <td className="td">{p.supplier}</td>
                  <td className="td text-ink-400">{formatJalali(new Date(p.date), 'short')}</td>
                  <td className="td"><Money value={p.amount} compact /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink-100 mb-2">آخرین هزینه‌ها</h2>
          <Table>
            <thead>
              <tr className="border-b border-ink-800">
                <th className="th">دسته</th>
                <th className="th">شرح</th>
                <th className="th">تاریخ</th>
                <th className="th">مبلغ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-850">
              {data.recentExpenses.map((e) => (
                <tr key={e.id}>
                  <td className="td">{e.category}</td>
                  <td className="td text-ink-400 max-w-[12rem] truncate">{e.description ?? '—'}</td>
                  <td className="td text-ink-400">{formatJalali(new Date(e.date), 'short')}</td>
                  <td className="td"><Money value={e.amount} compact /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </>
  );
}

function RankedList({
  title, hint, rows,
}: {
  title: string;
  hint?: string;
  rows: Array<{
    id: string; name: string; primary: string; secondary: string;
    tone?: 'positive' | 'negative' | 'warning';
  }>;
}) {
  const toneClass = {
    positive: 'text-pistachio-400', negative: 'text-pomegranate-400',
    warning: 'text-saffron-400', undefined: 'text-ink-100',
  };
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      {hint && <p className="mt-0.5 text-2xs text-ink-500">{hint}</p>}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-2xs text-ink-500">داده‌ای برای این دوره نیست.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-ink-850 text-2xs text-ink-500 tabular">
                {(index + 1).toLocaleString('fa-IR')}
              </span>
              <Link href={`/menu-items/${row.id}`} className="min-w-0 flex-1 truncate text-sm text-ink-200 hover:text-saffron-400 transition-colors">
                {row.name}
              </Link>
              <div className="text-left shrink-0">
                <p className={`text-sm font-semibold tabular ${toneClass[row.tone ?? 'undefined']}`}>
                  {row.primary}
                </p>
                <p className="text-2xs text-ink-500 tabular">{row.secondary}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
