import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guard';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { costOneMenuItem } from '@/server/services/costing';
import { resolveCostingProfile, loadEngineContext } from '@/server/services/context';
import { PageHeader, Badge } from '@/components/ui';
import { CostBuilder, type BuilderLine } from '@/components/cost/CostBuilder';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const item = await prisma.menuItem.findUnique({ where: { id: (await params).id } });
  return { title: `قیمت تمام‌شده ${item?.namePersian ?? ''}` };
}

export default async function CostBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: user.restaurantId },
    include: {
      category: true,
      recipe: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
    },
  });
  if (!item) notFound();

  const [restaurant, costed, profile, ctx, units, ingredients] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    costOneMenuItem(user.restaurantId, id),
    resolveCostingProfile(user.restaurantId, item.costingProfileId),
    loadEngineContext(user.restaurantId),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
    prisma.ingredient.findMany({ where: { restaurantId: user.restaurantId } }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const unitByCode = new Map(units.map((u) => [u.id, u.code]));
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

  // Flatten the BOM into editable rows. Sub-recipe lines expose their quantity
  // but not a purchase price — that lives on the ingredients inside them.
  const lines: BuilderLine[] = (item.recipe?.items ?? []).map((line) => {
    const ingredient = line.ingredientId ? ingredientById.get(line.ingredientId) : null;
    const subRecipe = line.subRecipeId ? ctx.recipes.get(line.subRecipeId) : null;

    return {
      id: line.id,
      kind: line.ingredientId ? 'INGREDIENT' : 'SUB_RECIPE',
      refId: (line.ingredientId ?? line.subRecipeId)!,
      name: ingredient?.namePersian ?? subRecipe?.namePersian ?? '—',
      quantity: line.quantity.toString(),
      unitCode: unitByCode.get(line.unitId) ?? '',
      unitId: line.unitId,
      purchasePrice: ingredient
        ? (ingredient.averagePrice.isZero()
            ? ingredient.lastPurchasePrice
            : ingredient.averagePrice).toString()
        : null,
      purchaseUnitCode: ingredient ? unitByCode.get(ingredient.purchaseUnitId) ?? '' : null,
      yieldPercent: ingredient ? ingredient.yieldPercent.toString() : null,
      isPackaging: ingredient?.isPackaging ?? false,
    };
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-2xs">
        <Link href="/menu-items" className="text-ink-600 hover:text-forest-500">آیتم‌های منو</Link>
        <span className="text-ink-300">/</span>
        <Link href={`/menu-items/${id}`} className="text-ink-600 hover:text-forest-500">
          {item.namePersian}
        </Link>
        <span className="text-ink-300">/</span>
        <span className="text-ink-600">ساخت قیمت</span>
      </div>

      <PageHeader
        title={`قیمت تمام‌شده: ${item.namePersian}`}
        subtitle="هر عددی را عوض کنید، نتیجه بلافاصله محاسبه می‌شود — قبل از ذخیره"
        action={
          <div className="flex gap-2">
            <Badge tone="neutral">{item.category.namePersian}</Badge>
            <Link href={`/menu-items/${id}`} className="btn-ghost text-2xs py-1.5">
              نمای تفصیلی
            </Link>
          </div>
        }
      />

      {lines.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-600">برای این آیتم دستور پختی ثبت نشده است.</p>
          <p className="mt-1 text-2xs text-ink-600">
            بدون دستور پخت، فقط نیروی کار و سربار محاسبه می‌شود.
          </p>
        </div>
      ) : null}

      <CostBuilder
        menuItemId={id}
        initial={costed}
        lines={lines}
        symbol={symbol}
        laborMinutes={costed.laborMinutes}
        sellingPrice={costed.sellingPrice}
        canEditRecipe={hasPermission(user.permissions, PERMISSIONS.RECIPE_WRITE)}
        canEditProfile={hasPermission(user.permissions, PERMISSIONS.COST_CONFIGURE)}
        profile={{
          id: profile.id,
          name: profile.name,
          laborMethod: profile.laborMethod,
          laborCostPerMinute: String(profile.laborCostPerMinute),
          laborPercentOfRevenue: String(profile.laborPercentOfRevenue),
          overheadMethod: profile.overheadMethod,
          monthlyOverheadCost: String(profile.monthlyOverheadCost),
          expectedMonthlyUnits: profile.expectedMonthlyUnits,
          overheadPercentOfRevenue: String(profile.overheadPercentOfRevenue),
          overheadPercentOfFoodCost: String(profile.overheadPercentOfFoodCost),
          pricingStrategy: profile.pricingStrategy,
          targetGrossMargin: String(profile.targetGrossMargin),
          targetFoodCostPct: String(profile.targetFoodCostPct),
          markupMultiplier: String(profile.markupMultiplier),
          minimumMargin: String(profile.minimumMargin),
          roundingRule: profile.roundingRule,
          taxRate: String(profile.taxRate),
          wasteBufferPct: String(profile.wasteBufferPct),
        }}
      />
    </>
  );
}
