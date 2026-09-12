import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, KpiCard, Badge, Table } from '@/components/ui';
import { IngredientPriceEditor, type EditableIngredient } from '@/components/cost/IngredientPriceEditor';
import { NewIngredientForm } from '@/components/cost/NewIngredientForm';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { formatCurrency, formatPercent, formatNumber, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';

export const metadata = { title: 'مواد اولیه' };
export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  MEAT: 'گوشت قرمز', POULTRY: 'مرغ و طیور', SEAFOOD: 'آبزیان', DAIRY: 'لبنیات',
  VEGETABLE: 'سبزیجات', FRUIT: 'میوه', GRAIN: 'غلات', SPICE: 'ادویه',
  OIL: 'روغن', BEVERAGE: 'نوشیدنی', PACKAGING: 'بسته‌بندی',
  CLEANING: 'شوینده', OTHER: 'سایر',
};

export default async function IngredientsPage() {
  const user = await requireUser();

  const [restaurant, ingredients, units, suppliers] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.ingredient.findMany({
      where: { restaurantId: user.restaurantId },
      include: {
        defaultSupplier: true,
        stockLevels: true,
        priceHistory: { orderBy: { effectiveAt: 'desc' }, take: 2 },
      },
      orderBy: [{ category: 'asc' }, { namePersian: 'asc' }],
    }),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
    prisma.supplier.findMany({
      where: { restaurantId: user.restaurantId, isActive: true },
      orderBy: { namePersian: 'asc' },
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const unitLabel = new Map(units.map((u) => [u.id, u.labelPersian]));
  const canEditIngredients = hasPermission(user.permissions, PERMISSIONS.INGREDIENT_WRITE);

  const withYieldLoss = ingredients.filter((i) => Number(i.yieldPercent) < 1).length;
  const risen = ingredients.filter((i) => Number(i.priceHistory[0]?.changePercent ?? 0) > 0).length;

  return (
    <>
      <PageHeader
        title="مواد اولیه"
        subtitle="قیمت خرید، ضریب تبدیل واحد و بازده مصرف — پایه محاسبه قیمت تمام‌شده"
      />

      {canEditIngredients && (
        <div className="mb-4">
          <NewIngredientForm
            symbol={symbol}
            units={units.map((u) => ({ id: u.id, code: u.code, label: u.labelPersian }))}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.namePersian ?? s.name }))}
          />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="تعداد اقلام" value={faDigits(ingredients.length)} />
        <KpiCard
          label="اقلام دارای افت" value={faDigits(withYieldLoss)}
          sub="پاک‌کردنی: قیمت واقعی بالاتر از قیمت خرید است"
        />
        <KpiCard label="افزایش قیمت اخیر" value={faDigits(risen)} tone={risen ? 'warning' : 'positive'} />
        <KpiCard
          label="اقلام بسته‌بندی"
          value={faDigits(ingredients.filter((i) => i.isPackaging).length)}
          sub="از درصد مواد اولیه جدا محاسبه می‌شود"
        />
      </div>

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-ink-800">ویرایش قیمت و بازده</h2>
          <p className="mt-0.5 text-2xs leading-5 text-ink-600">
            چند ردیف را با هم تغییر دهید و یک‌جا ذخیره کنید. ستون «اثر» نشان می‌دهد هزینه هر
            واحد مصرف چند درصد جابه‌جا می‌شود.
          </p>
        </div>
        <IngredientPriceEditor
          symbol={symbol}
          canEdit={canEditIngredients}
          ingredients={ingredients
            .filter((i) => i.isActive)
            .map((i): EditableIngredient => ({
              id: i.id,
              name: i.namePersian,
              purchaseUnit: unitLabel.get(i.purchaseUnitId) ?? '',
              recipeUnit: unitLabel.get(i.recipeUnitId) ?? '',
              conversionFactor: i.conversionFactor.toString(),
              price: (i.averagePrice.isZero() ? i.lastPurchasePrice : i.averagePrice).toString(),
              yieldPercent: i.yieldPercent.toString(),
            }))}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">همه مواد اولیه</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">ماده اولیه</th>
              <th className="th">دسته</th>
              <th className="th">واحد خرید</th>
              <th className="th">واحد مصرف</th>
              <th className="th">ضریب تبدیل</th>
              <th className="th">قیمت خرید</th>
              <th className="th">قیمت هر واحد مصرف</th>
              <th className="th">بازده</th>
              <th className="th">قیمت مؤثر</th>
              <th className="th">موجودی</th>
              <th className="th">تأمین‌کننده</th>
              <th className="th">آخرین خرید</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {ingredients.map((ingredient) => {
              const purchasePrice = Number(ingredient.averagePrice) || Number(ingredient.lastPurchasePrice);
              const factor = Number(ingredient.conversionFactor);
              const perRecipeUnit = factor > 0 ? purchasePrice / factor : 0;
              const yieldPercent = Number(ingredient.yieldPercent);
              // What a usable unit really costs once trimming loss is paid for.
              const effective = yieldPercent > 0 ? perRecipeUnit / yieldPercent : 0;
              const stock = ingredient.stockLevels.reduce((a, s) => a + Number(s.quantity), 0);
              const change = Number(ingredient.priceHistory[0]?.changePercent ?? 0);

              return (
                <tr key={ingredient.id} className="hover:bg-ink-100/50 transition-colors">
                  <td className="td">
                    <span className={ingredient.isActive ? '' : 'text-ink-400 line-through'}>
                      {ingredient.namePersian}
                    </span>
                    {ingredient.isPackaging && (
                      <span className="mr-2 rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-600">
                        بسته‌بندی
                      </span>
                    )}
                  </td>
                  <td className="td text-2xs text-ink-600">
                    {CATEGORY_LABELS[ingredient.category] ?? ingredient.category}
                  </td>
                  <td className="td text-ink-600">{unitLabel.get(ingredient.purchaseUnitId)}</td>
                  <td className="td text-ink-600">{unitLabel.get(ingredient.recipeUnitId)}</td>
                  <td className="td tabular text-ink-600">{formatNumber(factor)}</td>
                  <td className="td tabular">
                    {formatCurrency(purchasePrice, { compact: true })}
                    {change > 0 && (
                      <span className="mr-1.5 text-2xs text-pomegranate-400">
                        {formatPercent(change, { sign: true, decimals: 0 })}
                      </span>
                    )}
                  </td>
                  <td className="td tabular text-ink-600">
                    {formatCurrency(perRecipeUnit, { decimals: 2 })}
                  </td>
                  <td className="td tabular">
                    {yieldPercent < 1 ? (
                      <span className="text-forest-500">{formatPercent(yieldPercent, { decimals: 0 })}</span>
                    ) : (
                      <span className="text-ink-400">۱۰۰٪</span>
                    )}
                  </td>
                  <td className="td tabular text-ink-800">
                    {formatCurrency(effective, { decimals: 2 })}
                  </td>
                  <td className="td tabular text-ink-600">
                    {formatNumber(Math.round(stock))}
                  </td>
                  <td className="td text-2xs text-ink-600">
                    {ingredient.defaultSupplier?.namePersian ?? '—'}
                  </td>
                  <td className="td text-2xs text-ink-600">
                    {ingredient.lastPurchaseDate ? formatJalali(ingredient.lastPurchaseDate, 'short') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <p className="mt-2 text-2xs leading-6 text-ink-600">
          «قیمت مؤثر» قیمت هر واحد <em>قابل‌استفاده</em> است: اگر ۱۰ کیلو گوشت بخرید و پس از
          پاک‌کردن ۸ کیلو بماند، همان ۸ کیلو باید هزینه کل ۱۰ کیلو را بپردازد. محاسبه بر پایه
          قیمت خرید خام، قیمت تمام‌شده هر غذا را کمتر از واقع نشان می‌دهد.
        </p>
      </section>
    </>
  );
}
