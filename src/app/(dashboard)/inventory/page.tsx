import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { getStockAlerts, getInventoryValuation } from '@/server/services/inventory';
import { PageHeader, KpiCard, Badge, Table } from '@/components/ui';
import { formatCurrency, formatNumber, faDigits } from '@/lib/format';
import { formatJalaliDateTime } from '@/lib/jalali';

export const metadata = { title: 'موجودی' };
export const dynamic = 'force-dynamic';

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: 'رسید خرید',
  SALE_DEPLETION: 'مصرف فروش',
  SALE_REVERSAL: 'برگشت فروش',
  WASTE: 'ضایعات',
  ADJUSTMENT: 'اصلاح دستی',
  TRANSFER_IN: 'انتقال ورودی',
  TRANSFER_OUT: 'انتقال خروجی',
  COUNT_CORRECTION: 'اصلاح انبارگردانی',
  PRODUCTION_IN: 'تولید (ورود)',
  PRODUCTION_OUT: 'تولید (مصرف)',
};

const STATUS_META = {
  OUT_OF_STOCK: { label: 'ناموجود', tone: 'negative' as const },
  CRITICAL: { label: 'بحرانی', tone: 'negative' as const },
  LOW: { label: 'کم', tone: 'warning' as const },
  OK: { label: 'مناسب', tone: 'positive' as const },
};

export default async function InventoryPage() {
  const user = await requireUser();

  const [restaurant, levels, alerts, valuation, movements, units] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.stockLevel.findMany({
      where: { ingredient: { restaurantId: user.restaurantId } },
      include: { ingredient: true, warehouse: true },
    }),
    getStockAlerts(user.restaurantId),
    getInventoryValuation(user.restaurantId),
    prisma.inventoryTransaction.findMany({
      where: { ingredient: { restaurantId: user.restaurantId } },
      include: { ingredient: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 60,
    }),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const unitLabel = new Map(units.map((u) => [u.id, u.labelPersian]));
  const alertByIngredient = new Map(alerts.map((a) => [a.ingredientId, a]));

  const outOfStock = alerts.filter((a) => a.status === 'OUT_OF_STOCK').length;
  const lowStock = alerts.filter((a) => a.status !== 'OUT_OF_STOCK').length;

  return (
    <>
      <PageHeader
        title="موجودی انبار"
        subtitle="موجودی لحظه‌ای، ارزش‌گذاری میانگین موزون و دفتر کامل حرکت کالا"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="ارزش کل موجودی"
          value={formatCurrency(valuation.toFixed(), { symbol, compact: true })}
          sub="بر پایه میانگین موزون"
        />
        <KpiCard label="اقلام انبار" value={faDigits(levels.length)} />
        <KpiCard
          label="ناموجود" value={faDigits(outOfStock)}
          tone={outOfStock > 0 ? 'negative' : 'positive'}
        />
        <KpiCard
          label="زیر حد سفارش" value={faDigits(lowStock)}
          tone={lowStock > 0 ? 'warning' : 'positive'}
        />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">موجودی فعلی</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">ماده اولیه</th>
              <th className="th">انبار</th>
              <th className="th">موجودی</th>
              <th className="th">حد سفارش</th>
              <th className="th">میانگین قیمت واحد</th>
              <th className="th">ارزش</th>
              <th className="th">وضعیت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {levels
              .sort((a, b) =>
                Number(b.quantity) * Number(b.avgUnitCost) - Number(a.quantity) * Number(a.avgUnitCost))
              .map((level) => {
                const status = alertByIngredient.get(level.ingredientId)?.status ?? 'OK';
                const value = Number(level.quantity) * Number(level.avgUnitCost);
                return (
                  <tr key={level.id} className="hover:bg-ink-100/50 transition-colors">
                    <td className="td">{level.ingredient.namePersian}</td>
                    <td className="td text-ink-600">{level.warehouse.namePersian}</td>
                    <td className="td tabular">
                      {formatNumber(Math.round(Number(level.quantity)))}
                      <span className="mr-1 text-ink-400">
                        {unitLabel.get(level.ingredient.recipeUnitId)}
                      </span>
                    </td>
                    <td className="td tabular text-ink-600">
                      {formatNumber(Math.round(Number(level.ingredient.reorderLevel)))}
                    </td>
                    <td className="td tabular text-ink-600">
                      {formatCurrency(level.avgUnitCost.toString(), { decimals: 2 })}
                    </td>
                    <td className="td tabular text-ink-800">
                      {formatCurrency(value, { compact: true })}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </Table>
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-ink-800">دفتر حرکت کالا</h2>
        <p className="mb-3 text-2xs text-ink-600">
          هر تغییر موجودی یک سطر دارد: چه چیزی، چه مقدار، توسط چه کسی و به استناد کدام سند.
        </p>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">تاریخ</th>
              <th className="th">ماده اولیه</th>
              <th className="th">نوع</th>
              <th className="th">مقدار</th>
              <th className="th">قیمت واحد</th>
              <th className="th">ارزش</th>
              <th className="th">مانده</th>
              <th className="th">کاربر</th>
              <th className="th">سند</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {movements.map((movement) => {
              const quantity = Number(movement.quantity);
              return (
                <tr key={movement.id}>
                  <td className="td text-ink-600 text-2xs">
                    {formatJalaliDateTime(movement.occurredAt)}
                  </td>
                  <td className="td">{movement.ingredient.namePersian}</td>
                  <td className="td text-2xs text-ink-600">
                    {MOVEMENT_LABELS[movement.type] ?? movement.type}
                  </td>
                  <td className={`td tabular ${quantity >= 0 ? 'text-pistachio-400' : 'text-pomegranate-400'}`}>
                    {quantity >= 0 ? '+' : ''}{formatNumber(Math.round(quantity))}
                  </td>
                  <td className="td tabular text-ink-600">
                    {formatCurrency(movement.unitCost.toString(), { decimals: 2 })}
                  </td>
                  <td className="td tabular text-ink-600">
                    {formatCurrency(movement.totalCost.toString(), { compact: true })}
                  </td>
                  <td className="td tabular text-ink-600">
                    {formatNumber(Math.round(Number(movement.balanceAfter)))}
                  </td>
                  <td className="td text-2xs text-ink-600">{movement.user?.name ?? '—'}</td>
                  <td className="td text-2xs text-ink-600 max-w-[12rem] truncate">
                    {movement.reason ?? '—'}
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
