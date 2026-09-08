import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { costAllMenuItems } from '@/server/services/costing';
import { PageHeader, Badge, Table } from '@/components/ui';
import { CostBar } from '@/components/CostBar';
import { formatCurrency, formatPercent } from '@/lib/format';

export const metadata = { title: 'آیتم‌های منو' };
export const dynamic = 'force-dynamic';

export default async function MenuItemsPage() {
  const user = await requireUser();

  const [restaurant, costed, categories, items] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    costAllMenuItems(user.restaurantId),
    prisma.menuCategory.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId: user.restaurantId },
      select: { id: true, availability: true, isFeatured: true, priceIsOverridden: true },
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const meta = new Map(items.map((i) => [i.id, i]));
  const byCategory = new Map(categories.map((c) => [c.id, c]));

  const belowTarget = costed.filter((c) => c.isBelowMinimumMargin).length;

  return (
    <>
      <PageHeader
        title="آیتم‌های منو"
        subtitle="قیمت تمام‌شده، حاشیه سود و قیمت پیشنهادی هر آیتم"
        action={
          belowTarget > 0 ? (
            <Badge tone="warning">
              {belowTarget.toLocaleString('fa-IR')} آیتم زیر حداقل حاشیه سود
            </Badge>
          ) : (
            <Badge tone="positive">همه آیتم‌ها بالای حداقل حاشیه سود</Badge>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {costed
          .sort((a, b) => Number(a.grossMarginPct) - Number(b.grossMarginPct))
          .map((item) => {
            const info = meta.get(item.menuItemId);
            const category = byCategory.get(item.categoryId);
            const recommended = Number(item.recommendedPrice);
            const actual = Number(item.sellingPrice);
            const gap = recommended - actual;

            return (
              <Link
                key={item.menuItemId}
                href={`/menu-items/${item.menuItemId}`}
                className="card card-hover p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-ink-50">{item.namePersian}</h2>
                    <p className="mt-0.5 text-2xs text-ink-500">{category?.namePersian}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.isUnprofitable ? (
                      <Badge tone="negative">زیان‌ده</Badge>
                    ) : item.isBelowMinimumMargin ? (
                      <Badge tone="warning">زیر هدف</Badge>
                    ) : (
                      <Badge tone="positive">{formatPercent(item.grossMarginPct)}</Badge>
                    )}
                    {info?.availability === 'UNAVAILABLE' && <Badge tone="negative">ناموجود</Badge>}
                  </div>
                </div>

                {/* The signature: price decomposed into where the money goes. */}
                <CostBar
                  ingredientCost={item.ingredientCost}
                  subRecipeCost={item.subRecipeCost}
                  laborCost={item.laborCost}
                  packagingCost={item.packagingCost}
                  overheadCost={item.overheadCost}
                  sellingPrice={item.sellingPrice}
                  symbol={symbol}
                />

                <dl className="grid grid-cols-3 gap-2 pt-1 border-t border-ink-850">
                  <div>
                    <dt className="label">تمام‌شده</dt>
                    <dd className="mt-0.5 text-sm tabular text-ink-200">
                      {formatCurrency(item.totalCost, { compact: true })}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">فروش</dt>
                    <dd className="mt-0.5 text-sm tabular font-semibold text-ink-50">
                      {formatCurrency(item.sellingPrice, { compact: true })}
                      {info?.priceIsOverridden && (
                        <span className="mr-1 text-2xs font-normal text-saffron-400">دستی</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">پیشنهادی</dt>
                    <dd
                      className={`mt-0.5 text-sm tabular ${
                        gap > 1000 ? 'text-saffron-400' : 'text-ink-400'
                      }`}
                    >
                      {formatCurrency(item.recommendedPrice, { compact: true })}
                    </dd>
                  </div>
                </dl>
              </Link>
            );
          })}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink-100">مقایسه کامل</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-800">
              <th className="th">آیتم</th>
              <th className="th">مواد اولیه</th>
              <th className="th">نیروی کار</th>
              <th className="th">بسته‌بندی</th>
              <th className="th">سربار</th>
              <th className="th">تمام‌شده</th>
              <th className="th">فروش</th>
              <th className="th">سود</th>
              <th className="th">حاشیه</th>
              <th className="th">مواد اولیه٪</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-850">
            {costed.map((item) => (
              <tr key={item.menuItemId} className="hover:bg-ink-850/50 transition-colors">
                <td className="td">
                  <Link href={`/menu-items/${item.menuItemId}`} className="hover:text-saffron-400">
                    {item.namePersian}
                  </Link>
                </td>
                <td className="td tabular text-ink-400">
                  {formatCurrency(Number(item.ingredientCost) + Number(item.subRecipeCost), { compact: true })}
                </td>
                <td className="td tabular text-ink-400">{formatCurrency(item.laborCost, { compact: true })}</td>
                <td className="td tabular text-ink-400">{formatCurrency(item.packagingCost, { compact: true })}</td>
                <td className="td tabular text-ink-400">{formatCurrency(item.overheadCost, { compact: true })}</td>
                <td className="td tabular text-ink-100 font-medium">{formatCurrency(item.totalCost, { compact: true })}</td>
                <td className="td tabular text-ink-50 font-semibold">{formatCurrency(item.sellingPrice, { compact: true })}</td>
                <td className={`td tabular ${Number(item.grossProfit) > 0 ? 'text-pistachio-400' : 'text-pomegranate-400'}`}>
                  {formatCurrency(item.grossProfit, { compact: true })}
                </td>
                <td className={`td tabular ${item.isUnprofitable ? 'text-pomegranate-400' : item.isBelowMinimumMargin ? 'text-saffron-400' : 'text-pistachio-400'}`}>
                  {formatPercent(item.grossMarginPct)}
                </td>
                <td className="td tabular text-ink-400">{formatPercent(item.foodCostPct)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
