import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, KpiCard, Table, Badge } from '@/components/ui';
import { formatCurrency, formatPercent, formatNumber, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';
import { resolveRange } from '@/server/services/reports';

export const metadata = { title: 'ضایعات' };
export const dynamic = 'force-dynamic';

const REASON_LABELS: Record<string, string> = {
  SPOILAGE: 'فساد', EXPIRED: 'انقضا', BURNED: 'سوختن',
  PREPARATION: 'ضایعات آماده‌سازی', OVERPRODUCTION: 'تولید مازاد',
  DAMAGED: 'آسیب‌دیدگی', UNKNOWN: 'نامشخص', OTHER: 'سایر',
};

export default async function WastePage() {
  const user = await requireUser();
  const month = resolveRange('this_month');

  const [restaurant, wastes, monthTotal, units] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.waste.findMany({
      where: { restaurantId: user.restaurantId },
      include: { ingredient: true, user: true },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    }),
    prisma.waste.aggregate({
      where: { restaurantId: user.restaurantId, occurredAt: { gte: month.from, lte: month.to } },
      _sum: { totalCost: true },
      _count: true,
    }),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const unitLabel = new Map(units.map((u) => [u.id, u.labelPersian]));

  // Group by reason and by ingredient, to answer "where is it going?"
  const byReason = new Map<string, { count: number; cost: number }>();
  const byIngredient = new Map<string, { name: string; quantity: number; cost: number }>();
  let allTimeCost = 0;

  for (const waste of wastes) {
    const cost = Math.abs(Number(waste.totalCost));
    allTimeCost += cost;

    const reason = byReason.get(waste.reason) ?? { count: 0, cost: 0 };
    byReason.set(waste.reason, { count: reason.count + 1, cost: reason.cost + cost });

    const ingredient = byIngredient.get(waste.ingredientId) ?? {
      name: waste.ingredient.namePersian, quantity: 0, cost: 0,
    };
    byIngredient.set(waste.ingredientId, {
      name: ingredient.name,
      quantity: ingredient.quantity + Number(waste.quantity),
      cost: ingredient.cost + cost,
    });
  }

  const topReasons = [...byReason.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const topIngredients = [...byIngredient.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 8);

  return (
    <>
      <PageHeader
        title="ضایعات"
        subtitle="ضایعات ثبت‌شده هم موجودی انبار و هم قیمت تمام‌شده واقعی را تحت تأثیر قرار می‌دهد"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="ضایعات این ماه"
          value={formatCurrency(Math.abs(Number(monthTotal._sum.totalCost ?? 0)), { symbol, compact: true })}
          tone="negative"
          sub={`${faDigits(monthTotal._count)} مورد ثبت‌شده`}
        />
        <KpiCard label="مجموع ثبت‌شده" value={formatCurrency(allTimeCost, { symbol, compact: true })} />
        <KpiCard label="تعداد رکورد" value={faDigits(wastes.length)} />
        <KpiCard
          label="بیشترین علت"
          value={topReasons[0] ? REASON_LABELS[topReasons[0][0]] : '—'}
          sub={topReasons[0] ? formatCurrency(topReasons[0][1].cost, { compact: true }) : undefined}
        />
      </div>

      <div className="mt-6 grid lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">به تفکیک علت</h2>
          <ul className="mt-3 space-y-2">
            {topReasons.map(([reason, stats]) => (
              <li key={reason}>
                <div className="flex items-baseline justify-between text-2xs">
                  <span className="text-ink-600">{REASON_LABELS[reason] ?? reason}</span>
                  <span className="tabular text-ink-700">
                    {formatCurrency(stats.cost, { compact: true })}
                    <span className="mr-2 text-ink-400">{faDigits(stats.count)} مورد</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-pomegranate-500"
                    style={{ width: `${allTimeCost > 0 ? (stats.cost / allTimeCost) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">پرضایعات‌ترین مواد اولیه</h2>
          <ul className="mt-3 space-y-2">
            {topIngredients.map(([id, stats]) => (
              <li key={id} className="flex items-baseline justify-between text-2xs">
                <span className="text-ink-600">{stats.name}</span>
                <span className="tabular text-ink-700">
                  {formatCurrency(stats.cost, { compact: true })}
                  <span className="mr-2 text-ink-400">{formatNumber(Math.round(stats.quantity))}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">رکوردهای ضایعات</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">تاریخ</th>
              <th className="th">ماده اولیه</th>
              <th className="th">مقدار</th>
              <th className="th">قیمت واحد</th>
              <th className="th">هزینه</th>
              <th className="th">علت</th>
              <th className="th">کاربر</th>
              <th className="th">یادداشت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {wastes.map((waste) => (
              <tr key={waste.id}>
                <td className="td text-2xs text-ink-600">{formatJalali(waste.occurredAt)}</td>
                <td className="td">{waste.ingredient.namePersian}</td>
                <td className="td tabular">
                  {formatNumber(Math.round(Number(waste.quantity)))}
                  <span className="mr-1 text-ink-400">
                    {unitLabel.get(waste.ingredient.recipeUnitId)}
                  </span>
                </td>
                <td className="td tabular text-ink-600">
                  {formatCurrency(waste.unitCost.toString(), { decimals: 2 })}
                </td>
                <td className="td tabular text-pomegranate-400">
                  {formatCurrency(Math.abs(Number(waste.totalCost)), { compact: true })}
                </td>
                <td className="td">
                  <Badge tone="neutral">{REASON_LABELS[waste.reason] ?? waste.reason}</Badge>
                </td>
                <td className="td text-2xs text-ink-600">{waste.user?.name ?? '—'}</td>
                <td className="td text-2xs text-ink-600 max-w-[12rem] truncate">{waste.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
