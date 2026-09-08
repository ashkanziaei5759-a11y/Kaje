import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, KpiCard, Badge, Table } from '@/components/ui';
import { formatCurrency, formatNumber, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';

export const metadata = { title: 'خریدها' };
export const dynamic = 'force-dynamic';

const STATUS_META = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' as const },
  PENDING_REVIEW: { label: 'در انتظار تأیید', tone: 'warning' as const },
  APPROVED: { label: 'تأیید شده', tone: 'positive' as const },
  CANCELLED: { label: 'لغو شده', tone: 'negative' as const },
};

export default async function PurchasesPage() {
  const user = await requireUser();

  const [restaurant, purchases, units, totals] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.purchase.findMany({
      where: { restaurantId: user.restaurantId },
      include: {
        supplier: true,
        createdBy: true,
        items: { include: { ingredient: true } },
      },
      orderBy: { purchaseDate: 'desc' },
      take: 40,
    }),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
    prisma.purchase.aggregate({
      where: { restaurantId: user.restaurantId, status: 'APPROVED' },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const unitLabel = new Map(units.map((u) => [u.id, u.labelPersian]));
  const pending = purchases.filter((p) => p.status !== 'APPROVED' && p.status !== 'CANCELLED').length;

  return (
    <>
      <PageHeader
        title="خریدها و فاکتورها"
        subtitle="با تأیید هر فاکتور، موجودی انبار و قیمت تمام‌شده غذاها به‌صورت خودکار به‌روز می‌شود"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="مجموع خرید تأییدشده"
          value={formatCurrency(totals._sum.totalAmount?.toString() ?? '0', { symbol, compact: true })}
        />
        <KpiCard label="تعداد فاکتور" value={faDigits(totals._count)} />
        <KpiCard
          label="در انتظار تأیید" value={faDigits(pending)}
          tone={pending > 0 ? 'warning' : 'positive'}
        />
        <KpiCard
          label="تأمین‌کنندگان فعال"
          value={faDigits(new Set(purchases.map((p) => p.supplierId)).size)}
        />
      </div>

      <section className="mt-6 space-y-3">
        {purchases.map((purchase) => (
          <article key={purchase.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink-50" dir="ltr">
                    {purchase.invoiceNumber ?? `#${purchase.id.slice(-6)}`}
                  </h2>
                  <Badge tone={STATUS_META[purchase.status].tone}>
                    {STATUS_META[purchase.status].label}
                  </Badge>
                </div>
                <p className="mt-1 text-2xs text-ink-500">
                  {purchase.supplier.namePersian ?? purchase.supplier.name}
                  {' — '}
                  {formatJalali(purchase.purchaseDate)}
                  {purchase.createdBy && ` — ثبت: ${purchase.createdBy.name}`}
                </p>
              </div>
              <div className="text-left">
                <p className="label">مبلغ فاکتور</p>
                <p className="mt-0.5 text-lg font-bold tabular text-ink-50">
                  {formatCurrency(purchase.totalAmount.toString(), { symbol })}
                </p>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-y border-ink-850">
                    <th className="th">ماده اولیه</th>
                    <th className="th">مقدار</th>
                    <th className="th">واحد</th>
                    <th className="th">قیمت واحد</th>
                    <th className="th">مبلغ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-850">
                  {purchase.items.map((item) => (
                    <tr key={item.id}>
                      <td className="td">{item.ingredient.namePersian}</td>
                      <td className="td tabular">{formatNumber(Number(item.quantity))}</td>
                      <td className="td text-ink-500">{unitLabel.get(item.unitId)}</td>
                      <td className="td tabular text-ink-400">
                        {formatCurrency(item.unitPrice.toString(), { compact: true })}
                      </td>
                      <td className="td tabular text-ink-200">
                        {formatCurrency(item.lineTotal.toString(), { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
