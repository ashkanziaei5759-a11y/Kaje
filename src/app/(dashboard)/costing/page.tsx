import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { costAllMenuItems } from '@/server/services/costing';
import { PageHeader, Badge, Table } from '@/components/ui';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';

export const metadata = { title: 'موتور قیمت‌گذاری' };
export const dynamic = 'force-dynamic';

const LABOR_METHODS: Record<string, string> = {
  PER_MINUTE: 'بر پایه دقیقه کار',
  PERCENT_OF_REVENUE: 'درصدی از فروش',
  PER_UNIT: 'تقسیم بر تعداد پرس ماهانه',
  NONE: 'غیرفعال',
};
const OVERHEAD_METHODS: Record<string, string> = {
  PER_UNIT: 'تقسیم بر تعداد پرس ماهانه',
  PERCENT_OF_REVENUE: 'درصدی از فروش',
  PERCENT_OF_FOOD_COST: 'درصدی از مواد اولیه',
  PER_LABOR_MINUTE: 'بر پایه دقیقه کار',
  NONE: 'غیرفعال',
};
const STRATEGIES: Record<string, string> = {
  TARGET_GROSS_MARGIN: 'هدف حاشیه سود ناخالص',
  TARGET_FOOD_COST: 'هدف درصد مواد اولیه',
  COST_PLUS_MARKUP: 'ضریب روی قیمت تمام‌شده',
  FIXED_PROFIT: 'سود ثابت',
};
const ROUNDING: Record<string, string> = {
  NONE: 'بدون گرد کردن',
  NEAREST_1000: 'گرد به ۱٬۰۰۰',
  NEAREST_5000: 'گرد به ۵٬۰۰۰',
  NEAREST_10000: 'گرد به ۱۰٬۰۰۰',
  CHARM_9: 'قیمت روان‌شناختی',
};

export default async function CostingPage() {
  const user = await requireUser();

  const [restaurant, profiles, costed] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.costingProfile.findMany({
      where: { restaurantId: user.restaurantId },
      include: { menuItems: true },
      orderBy: { isDefault: 'desc' },
    }),
    costAllMenuItems(user.restaurantId),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';

  return (
    <>
      <PageHeader
        title="موتور قیمت‌گذاری"
        subtitle="هیچ فرضی در کد نوشته نشده — نرخ نیروی کار، سربار، مالیات و هدف سود همه اینجا تعیین می‌شوند"
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {profiles.map((profile) => (
          <article key={profile.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-ink-900">{profile.namePersian}</h2>
                <p className="text-2xs text-ink-600">{profile.name}</p>
              </div>
              {profile.isDefault && <Badge tone="accent">پیش‌فرض</Badge>}
            </div>

            <p className="mt-2 text-2xs text-ink-600">
              {faDigits(profile.menuItems.length)} آیتم از این پروفایل استفاده می‌کند
            </p>

            <dl className="mt-3 space-y-3">
              <Group title="نیروی کار">
                <Row label="روش" value={LABOR_METHODS[profile.laborMethod]} />
                {profile.laborMethod === 'PER_MINUTE' && (
                  <Row label="هزینه هر دقیقه" value={formatCurrency(profile.laborCostPerMinute.toString(), { symbol })} />
                )}
                {profile.laborMethod === 'PERCENT_OF_REVENUE' && (
                  <Row label="درصد از فروش" value={formatPercent(profile.laborPercentOfRevenue.toString())} />
                )}
              </Group>

              <Group title="سربار">
                <Row label="روش" value={OVERHEAD_METHODS[profile.overheadMethod]} />
                {profile.overheadMethod === 'PER_UNIT' && (
                  <>
                    <Row label="سربار ماهانه" value={formatCurrency(profile.monthlyOverheadCost.toString(), { compact: true })} />
                    <Row label="پرس مورد انتظار ماهانه" value={faDigits(profile.expectedMonthlyUnits)} />
                    <Row
                      label="سربار هر پرس"
                      value={formatCurrency(
                        Number(profile.monthlyOverheadCost) / Math.max(1, profile.expectedMonthlyUnits),
                        { symbol },
                      )}
                      emphasis
                    />
                  </>
                )}
                {profile.overheadMethod === 'PERCENT_OF_REVENUE' && (
                  <Row label="درصد از فروش" value={formatPercent(profile.overheadPercentOfRevenue.toString())} />
                )}
                {profile.overheadMethod === 'PERCENT_OF_FOOD_COST' && (
                  <Row label="درصد از مواد اولیه" value={formatPercent(profile.overheadPercentOfFoodCost.toString())} />
                )}
              </Group>

              <Group title="قیمت‌گذاری">
                <Row label="راهبرد" value={STRATEGIES[profile.pricingStrategy]} />
                <Row label="هدف حاشیه سود" value={formatPercent(profile.targetGrossMargin.toString())} />
                <Row label="هدف درصد مواد اولیه" value={formatPercent(profile.targetFoodCostPct.toString())} />
                <Row label="حداقل حاشیه قابل قبول" value={formatPercent(profile.minimumMargin.toString())} />
                <Row label="گرد کردن قیمت" value={ROUNDING[profile.roundingRule]} />
                <Row
                  label="مالیات"
                  value={`${formatPercent(profile.taxRate.toString())} ${profile.taxInclusive ? '(داخل قیمت)' : '(اضافه بر قیمت)'}`}
                />
                <Row label="ضریب ضایعات عمومی" value={formatPercent(profile.wasteBufferPct.toString())} />
              </Group>
            </dl>
          </article>
        ))}
      </div>

      <section className="mt-6 card p-4">
        <h2 className="text-sm font-semibold text-ink-800">فرمول‌های موتور</h2>
        <p className="mt-1 text-2xs text-ink-600">
          این‌ها دقیقاً همان فرمول‌هایی هستند که در محاسبه هر آیتم اجرا می‌شوند.
        </p>
        <div className="mt-3 space-y-2 font-mono text-2xs" dir="ltr">
          {[
            'ingredient_cost = Σ (quantity ÷ (1 − line_waste)) × (unit_price ÷ conversion_factor ÷ yield)',
            'sub_recipe_cost = Σ sub_recipe_unit_cost × consumed_quantity',
            'recipe_cost = (ingredient_cost + sub_recipe_cost) ÷ recipe_yield ÷ portions',
            'labor_cost = labor_minutes × cost_per_minute',
            'overhead_cost = monthly_overhead ÷ expected_monthly_units',
            'total_cost = food_cost + packaging + labor_cost + overhead_cost',
            'gross_profit = selling_price − total_cost',
            'gross_margin_% = gross_profit ÷ selling_price',
            'food_cost_% = food_cost ÷ selling_price',
            'recommended_price = total_cost ÷ (1 − target_gross_margin)',
          ].map((formula) => (
            <p key={formula} className="rounded-lg border border-ink-200 bg-ink-100 px-3 py-2 text-ink-600">
              {formula}
            </p>
          ))}
        </div>
        <p className="mt-3 text-2xs leading-6 text-ink-600">
          توجه: قیمت پیشنهادی بر قیمت تمام‌شده <em>تقسیم</em> می‌شود، نه ضرب. اگر قیمت تمام‌شده
          ۳۴۵٬۰۰۰ را در ۱٫۳ ضرب کنیم، حاشیه سود واقعی ۲۳٪ می‌شود نه ۳۰٪ — چون حاشیه سود نسبت به
          قیمت فروش سنجیده می‌شود، نه نسبت به قیمت تمام‌شده.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">اثر تنظیمات بر قیمت پیشنهادی</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">آیتم</th>
              <th className="th">قیمت تمام‌شده</th>
              <th className="th">پیشنهادی (خام)</th>
              <th className="th">پس از گرد کردن</th>
              <th className="th">قیمت فعلی</th>
              <th className="th">اختلاف</th>
              <th className="th">منبع قیمت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {costed.map((item) => {
              const gap = Number(item.recommendedPrice) - Number(item.sellingPrice);
              return (
                <tr key={item.menuItemId}>
                  <td className="td">{item.namePersian}</td>
                  <td className="td tabular text-ink-600">{formatCurrency(item.totalCost, { compact: true })}</td>
                  <td className="td tabular text-ink-600">{formatCurrency(item.rawRecommendedPrice, { compact: true })}</td>
                  <td className="td tabular text-forest-500">{formatCurrency(item.recommendedPrice, { compact: true })}</td>
                  <td className="td tabular text-ink-800">{formatCurrency(item.sellingPrice, { compact: true })}</td>
                  <td className={`td tabular ${Math.abs(gap) < 1000 ? 'text-ink-400' : gap > 0 ? 'text-forest-500' : 'text-pistachio-400'}`}>
                    {Math.abs(gap) < 1000 ? '—' : formatCurrency(gap, { compact: true })}
                  </td>
                  <td className="td">
                    <Badge tone={item.priceSource === 'MANUAL_OVERRIDE' ? 'accent' : 'neutral'}>
                      {item.priceSource === 'MANUAL_OVERRIDE' ? 'دستی'
                        : item.priceSource === 'RECOMMENDED' ? 'پیشنهاد موتور' : 'ذخیره‌شده'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-ink-100 p-2.5">
      <p className="label mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-2xs">
      <span className="text-ink-600">{label}</span>
      <span className={`tabular ${emphasis ? 'font-semibold text-forest-500' : 'text-ink-700'}`}>
        {value}
      </span>
    </div>
  );
}
