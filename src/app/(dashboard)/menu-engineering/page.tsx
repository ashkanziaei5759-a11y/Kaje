import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { getMenuEngineering, resolveRange, type RangePreset } from '@/server/services/reports';
import { PageHeader, Badge, Table } from '@/components/ui';
import { RangePicker } from '@/components/RangePicker';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';
import type { MenuClass, MenuRecommendation } from '@/lib/engine/menu-engineering';

export const metadata = { title: 'مهندسی منو' };
export const dynamic = 'force-dynamic';

const CLASS_META: Record<MenuClass, { label: string; hint: string; tone: string; dot: string }> = {
  STAR: {
    label: 'ستاره', hint: 'پرفروش و پرسود — حفظ و برجسته‌سازی',
    tone: 'border-pistachio-500/40 bg-pistachio-500/10', dot: 'bg-pistachio-400',
  },
  PLOWHORSE: {
    label: 'اسب بارکش', hint: 'پرفروش اما کم‌سود — کاهش هزینه یا افزایش قیمت',
    tone: 'border-saffron-400/40 bg-saffron-400/10', dot: 'bg-saffron-400',
  },
  PUZZLE: {
    label: 'معما', hint: 'پرسود اما کم‌فروش — مشکل دیده‌شدن است، نه قیمت',
    tone: 'border-ink-600 bg-ink-800/60', dot: 'bg-ink-400',
  },
  DOG: {
    label: 'سگ', hint: 'کم‌فروش و کم‌سود — بازطراحی یا حذف',
    tone: 'border-pomegranate-500/40 bg-pomegranate-500/10', dot: 'bg-pomegranate-400',
  },
};

const RECOMMENDATION_LABELS: Record<MenuRecommendation, string> = {
  KEEP: 'حفظ شود',
  PROMOTE: 'تبلیغ شود',
  INCREASE_PRICE: 'افزایش قیمت',
  REDUCE_COST: 'کاهش هزینه دستور پخت',
  REPOSITION: 'جابه‌جایی در منو',
  REMOVE: 'حذف از منو',
};

const PRESETS: RangePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month'];

export default async function MenuEngineeringPage({
  searchParams,
}: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const preset = (PRESETS.includes(params.range as RangePreset) ? params.range : 'this_month') as RangePreset;
  const range = resolveRange(preset);

  const [restaurant, report] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    getMenuEngineering(user.restaurantId, range),
  ]);
  const symbol = restaurant?.currencySymbol ?? '';

  const quadrants: MenuClass[] = ['STAR', 'PUZZLE', 'PLOWHORSE', 'DOG'];

  return (
    <>
      <PageHeader
        title="مهندسی منو"
        subtitle="هر آیتم بر اساس محبوبیت و حاشیه مشارکت، در یکی از چهار دسته"
        action={<RangePicker current={preset} />}
      />

      {report.items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-300">در این بازه فروشی ثبت نشده است.</p>
          <p className="mt-1 text-2xs text-ink-500">بازه دیگری را انتخاب کنید.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quadrants.map((quadrant) => (
              <div key={quadrant} className={`rounded-xl border p-4 ${CLASS_META[quadrant].tone}`}>
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${CLASS_META[quadrant].dot}`} />
                  <p className="text-sm font-semibold text-ink-50">{CLASS_META[quadrant].label}</p>
                  <span className="mr-auto tabular text-lg font-bold text-ink-100">
                    {faDigits(report.counts[quadrant])}
                  </span>
                </div>
                <p className="mt-2 text-2xs leading-5 text-ink-400">{CLASS_META[quadrant].hint}</p>
              </div>
            ))}
          </div>

          {/* The 2×2 matrix. */}
          <section className="mt-4 card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-100">ماتریس محبوبیت / سودآوری</h2>
              <p className="text-2xs text-ink-500">
                خط محبوبیت: {formatPercent(report.popularityThreshold)} — میانگین حاشیه مشارکت:{' '}
                {formatCurrency(report.averageContributionMargin, { symbol, compact: true })}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {quadrants.map((quadrant) => {
                const items = report.items.filter((i) => i.classification === quadrant);
                return (
                  <div key={quadrant} className={`min-h-32 rounded-xl border p-3 ${CLASS_META[quadrant].tone}`}>
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${CLASS_META[quadrant].dot}`} />
                      <p className="text-2xs font-semibold text-ink-200">{CLASS_META[quadrant].label}</p>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-2xs text-ink-600">—</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {items.map((item) => (
                          <li key={item.menuItemId}>
                            <Link
                              href={`/menu-items/${item.menuItemId}`}
                              className="flex items-baseline justify-between gap-2 text-2xs hover:text-saffron-400 transition-colors"
                            >
                              <span className="truncate text-ink-200">{item.namePersian}</span>
                              <span className="shrink-0 tabular text-ink-500">
                                {faDigits(item.unitsSold)} پرس
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {/* In RTL the first flex child sits on the right, which is where the
                high-popularity quadrants (STAR, PLOWHORSE) are rendered. */}
            <div className="mt-3 flex justify-between text-2xs text-ink-600">
              <span>محبوبیت بیشتر ←</span>
              <span>→ محبوبیت کمتر</span>
            </div>
          </section>

          <section className="mt-4">
            <h2 className="mb-3 text-sm font-semibold text-ink-100">جزئیات و پیشنهادها</h2>
            <Table>
              <thead>
                <tr className="border-b border-ink-800">
                  <th className="th">آیتم</th>
                  <th className="th">دسته</th>
                  <th className="th">تعداد فروش</th>
                  <th className="th">محبوبیت</th>
                  <th className="th">فروش</th>
                  <th className="th">حاشیه مشارکت</th>
                  <th className="th">سود کل</th>
                  <th className="th">حاشیه٪</th>
                  <th className="th">اقدام پیشنهادی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-850">
                {report.items
                  .sort((a, b) => Number(b.totalProfit) - Number(a.totalProfit))
                  .map((item) => (
                    <tr key={item.menuItemId} className="hover:bg-ink-850/50 transition-colors">
                      <td className="td">
                        <Link href={`/menu-items/${item.menuItemId}`} className="hover:text-saffron-400">
                          {item.namePersian}
                        </Link>
                      </td>
                      <td className="td">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${CLASS_META[item.classification].dot}`} />
                          <span className="text-2xs text-ink-300">
                            {CLASS_META[item.classification].label}
                          </span>
                        </span>
                      </td>
                      <td className="td tabular">{faDigits(item.unitsSold)}</td>
                      <td className="td tabular text-ink-400">{formatPercent(item.popularityPct)}</td>
                      <td className="td tabular text-ink-400">
                        {formatCurrency(item.revenue, { compact: true })}
                      </td>
                      <td className="td tabular text-ink-200">
                        {formatCurrency(item.contributionMargin, { compact: true })}
                      </td>
                      <td className="td tabular text-pistachio-400">
                        {formatCurrency(item.totalProfit, { compact: true })}
                      </td>
                      <td className="td tabular">{formatPercent(item.marginPct)}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {item.recommendations.map((recommendation) => (
                            <Badge
                              key={recommendation}
                              tone={
                                recommendation === 'REMOVE' ? 'negative'
                                  : recommendation === 'KEEP' ? 'positive' : 'warning'
                              }
                            >
                              {RECOMMENDATION_LABELS[recommendation]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
            <p className="mt-2 text-2xs leading-6 text-ink-500">
              «حاشیه مشارکت» سود هر پرس پس از کسر قیمت تمام‌شده است. یک آیتم وقتی «محبوب»
              شمرده می‌شود که سهمش از تعداد فروش، دست‌کم {formatPercent(report.popularityThreshold)}
              {' '}باشد — یعنی ۷۰٪ سهم برابر در منویی با {faDigits(report.items.length)} آیتم.
            </p>
          </section>
        </>
      )}
    </>
  );
}
