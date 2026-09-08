import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, KpiCard, Table, Badge } from '@/components/ui';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';

export const metadata = { title: 'تأمین‌کنندگان' };
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const user = await requireUser();

  const [restaurant, suppliers, priceHistory] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.supplier.findMany({
      where: { restaurantId: user.restaurantId },
      include: {
        ingredients: true,
        purchases: { where: { status: 'APPROVED' }, orderBy: { purchaseDate: 'desc' } },
      },
      orderBy: { namePersian: 'asc' },
    }),
    // Latest price each supplier charged for each ingredient, for comparison.
    prisma.ingredientPriceHistory.findMany({
      where: { ingredient: { restaurantId: user.restaurantId }, supplierId: { not: null } },
      include: { ingredient: true, supplier: true },
      orderBy: { effectiveAt: 'desc' },
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';

  // Build a price-comparison grid: for each ingredient, the latest price from
  // each supplier who has quoted it. Two or more suppliers means a real choice.
  const comparison = new Map<string, { name: string; quotes: Map<string, { price: number; date: Date }> }>();
  for (const entry of priceHistory) {
    if (!entry.supplier) continue;
    const row = comparison.get(entry.ingredientId) ?? {
      name: entry.ingredient.namePersian,
      quotes: new Map<string, { price: number; date: Date }>(),
    };
    // History is newest-first, so only record the first quote seen per supplier.
    if (!row.quotes.has(entry.supplier.id)) {
      row.quotes.set(entry.supplier.id, { price: Number(entry.price), date: entry.effectiveAt });
    }
    comparison.set(entry.ingredientId, row);
  }
  const contested = [...comparison.entries()].filter(([, row]) => row.quotes.size > 1);

  return (
    <>
      <PageHeader title="تأمین‌کنندگان" subtitle="سابقه خرید، شرایط پرداخت و مقایسه قیمت" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="تأمین‌کنندگان" value={faDigits(suppliers.length)} />
        <KpiCard
          label="فعال" value={faDigits(suppliers.filter((s) => s.isActive).length)} tone="positive"
        />
        <KpiCard
          label="مجموع خرید"
          value={formatCurrency(
            suppliers.reduce(
              (sum, s) => sum + s.purchases.reduce((n, p) => n + Number(p.totalAmount), 0), 0),
            { symbol, compact: true },
          )}
        />
        <KpiCard
          label="اقلام چند-تأمین‌کننده" value={faDigits(contested.length)}
          sub="قابل مقایسه قیمت"
        />
      </div>

      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {suppliers.map((supplier) => {
          const total = supplier.purchases.reduce((n, p) => n + Number(p.totalAmount), 0);
          const last = supplier.purchases[0];
          return (
            <article key={supplier.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-ink-50">
                    {supplier.namePersian ?? supplier.name}
                  </h2>
                  <p className="text-2xs text-ink-500">{supplier.name}</p>
                </div>
                <Badge tone={supplier.isActive ? 'positive' : 'neutral'}>
                  {supplier.isActive ? 'فعال' : 'غیرفعال'}
                </Badge>
              </div>

              <dl className="mt-3 space-y-1.5 text-2xs">
                {supplier.contactPerson && (
                  <Row label="رابط" value={supplier.contactPerson} />
                )}
                {supplier.phone && <Row label="تلفن" value={supplier.phone} />}
                {supplier.paymentTerms && <Row label="شرایط پرداخت" value={supplier.paymentTerms} />}
                {supplier.address && <Row label="نشانی" value={supplier.address} />}
                <Row label="اقلام تأمینی" value={`${faDigits(supplier.ingredients.length)} قلم`} />
                <Row label="تعداد فاکتور" value={faDigits(supplier.purchases.length)} />
                <Row label="مجموع خرید" value={formatCurrency(total, { symbol, compact: true })} />
                {last && <Row label="آخرین خرید" value={formatJalali(last.purchaseDate)} />}
              </dl>
            </article>
          );
        })}
      </section>

      {contested.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-semibold text-ink-100">مقایسه قیمت تأمین‌کنندگان</h2>
          <p className="mb-3 text-2xs text-ink-500">
            اقلامی که بیش از یک تأمین‌کننده برایشان قیمت داده‌اند. ارزان‌ترین قیمت با رنگ سبز.
          </p>
          <Table>
            <thead>
              <tr className="border-b border-ink-800">
                <th className="th">ماده اولیه</th>
                {suppliers.map((s) => (
                  <th key={s.id} className="th">{s.namePersian ?? s.name}</th>
                ))}
                <th className="th">اختلاف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-850">
              {contested.map(([ingredientId, row]) => {
                const prices = [...row.quotes.values()].map((q) => q.price);
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                return (
                  <tr key={ingredientId}>
                    <td className="td">{row.name}</td>
                    {suppliers.map((s) => {
                      const quote = row.quotes.get(s.id);
                      return (
                        <td
                          key={s.id}
                          className={`td tabular ${
                            quote?.price === min ? 'text-pistachio-400 font-medium'
                              : quote?.price === max ? 'text-pomegranate-400' : 'text-ink-400'
                          }`}
                        >
                          {quote ? formatCurrency(quote.price, { compact: true }) : '—'}
                        </td>
                      );
                    })}
                    <td className="td tabular text-saffron-400">
                      {min > 0 ? formatPercent((max - min) / min, { decimals: 0 }) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="truncate text-ink-300">{value}</dd>
    </div>
  );
}
