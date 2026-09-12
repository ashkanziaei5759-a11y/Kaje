import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { loadEngineContext } from '@/server/services/context';
import { costRecipe, CostEngineError } from '@/lib/engine/cost-engine';
import { PageHeader, KpiCard, Badge, Table } from '@/components/ui';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';

export const metadata = { title: 'دستور پخت' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  MENU_ITEM: 'غذای منو',
  SUB_RECIPE: 'دستور میانی',
  BATCH: 'تولید انبوه',
};

export default async function RecipesPage() {
  const user = await requireUser();

  const [restaurant, recipes, ctx, units] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.recipe.findMany({
      where: { restaurantId: user.restaurantId },
      include: {
        items: { include: { ingredient: true, subRecipe: true } },
        usedIn: { include: { recipe: true } },
        menuItems: true,
      },
      orderBy: [{ type: 'asc' }, { namePersian: 'asc' }],
    }),
    loadEngineContext(user.restaurantId),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const unitLabel = new Map(units.map((u) => [u.id, u.labelPersian]));

  const costed = recipes.map((recipe) => {
    try {
      return { recipe, result: costRecipe(recipe.id, ctx), error: null as string | null };
    } catch (error) {
      // A broken recipe must not blank the page — show it flagged so it can be fixed.
      return {
        recipe,
        result: null,
        error: error instanceof CostEngineError ? error.message : 'خطا در محاسبه',
      };
    }
  });

  const subRecipes = costed.filter((c) => c.recipe.type !== 'MENU_ITEM');
  const menuRecipes = costed.filter((c) => c.recipe.type === 'MENU_ITEM');
  const withLoss = recipes.filter(
    (r) => Number(r.recipeYieldPercent) < 1 || Number(r.preparationLossPercent) > 0,
  ).length;

  return (
    <>
      <PageHeader
        title="دستور پخت (BOM)"
        subtitle="ساختار مواد هر غذا، دستورهای تودرتو و افت پخت"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="کل دستورها" value={faDigits(recipes.length)} />
        <KpiCard label="دستورهای میانی" value={faDigits(subRecipes.length)} sub="سس، خمیر، پایه‌ها" />
        <KpiCard label="دارای افت پخت" value={faDigits(withLoss)} />
        <KpiCard
          label="دارای خطا"
          value={faDigits(costed.filter((c) => c.error).length)}
          tone={costed.some((c) => c.error) ? 'negative' : 'positive'}
        />
      </div>

      {[
        { title: 'دستورهای میانی و تولید انبوه', rows: subRecipes,
          hint: 'این دستورها مستقیم فروخته نمی‌شوند؛ داخل غذاهای دیگر مصرف می‌شوند.' },
        { title: 'دستور غذاهای منو', rows: menuRecipes, hint: null },
      ].map((group) => (
        <section key={group.title} className="mt-6">
          <h2 className="mb-1 text-sm font-semibold text-ink-800">{group.title}</h2>
          {group.hint && <p className="mb-3 text-2xs text-ink-600">{group.hint}</p>}
          <div className="space-y-3">
            {group.rows.map(({ recipe, result, error }) => (
              <article key={recipe.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{recipe.namePersian}</h3>
                      <Badge tone={recipe.type === 'MENU_ITEM' ? 'accent' : 'neutral'}>
                        {TYPE_LABELS[recipe.type]}
                      </Badge>
                      <Badge tone="neutral">نسخه {faDigits(recipe.currentVersion)}</Badge>
                    </div>
                    <p className="mt-1 text-2xs text-ink-600">
                      بازده: {faDigits(Number(recipe.yieldQuantity))}{' '}
                      {unitLabel.get(recipe.yieldUnitId ?? '') ?? ''}
                      {' — '}
                      زمان: {faDigits(recipe.prepTimeMinutes + recipe.cookTimeMinutes)} دقیقه
                      {Number(recipe.recipeYieldPercent) < 1 && (
                        <span className="mr-2 text-forest-500">
                          افت پخت: {formatPercent(1 - Number(recipe.recipeYieldPercent), { decimals: 0 })}
                        </span>
                      )}
                    </p>
                    {recipe.usedIn.length > 0 && (
                      <p className="mt-1 text-2xs text-ink-400">
                        مصرف در: {recipe.usedIn.map((u) => u.recipe.namePersian).join('، ')}
                      </p>
                    )}
                  </div>

                  <div className="text-left">
                    {error ? (
                      <Badge tone="negative">{error}</Badge>
                    ) : (
                      <>
                        <p className="label">قیمت تمام‌شده هر واحد</p>
                        <p className="mt-0.5 text-lg font-bold tabular text-forest-500">
                          {formatCurrency(result!.totalCost, { symbol })}
                        </p>
                        {Number(result!.wasteAdjustment) > 0 && (
                          <p className="text-2xs text-ink-600">
                            شامل {formatCurrency(result!.wasteAdjustment, { compact: true })} افت
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px]">
                    <thead>
                      <tr className="border-y border-ink-100">
                        <th className="th">جزء</th>
                        <th className="th">مقدار</th>
                        <th className="th">واحد</th>
                        <th className="th">ضایعات خط</th>
                        <th className="th">هزینه</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {recipe.items.map((item) => {
                        const line = result?.lines.find(
                          (l) => l.refId === (item.ingredientId ?? item.subRecipeId),
                        );
                        return (
                          <tr key={item.id}>
                            <td className="td">
                              {item.ingredient?.namePersian ?? item.subRecipe?.namePersian}
                              {item.subRecipeId && (
                                <span className="mr-2 rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-600">
                                  دستور میانی
                                </span>
                              )}
                            </td>
                            <td className="td tabular">{faDigits(Number(item.quantity))}</td>
                            <td className="td text-ink-600">{unitLabel.get(item.unitId)}</td>
                            <td className="td tabular text-ink-600">
                              {Number(item.wastePercent) > 0
                                ? formatPercent(item.wastePercent.toString(), { decimals: 0 })
                                : '—'}
                            </td>
                            <td className="td tabular text-ink-700">
                              {line ? formatCurrency(line.totalCost) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
