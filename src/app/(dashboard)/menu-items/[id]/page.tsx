import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { costOneMenuItem } from '@/server/services/costing';
import { resolveCostingProfile } from '@/server/services/context';
import { PageHeader, Badge, Table } from '@/components/ui';
import { CostBar } from '@/components/CostBar';
import { PriceEditor } from '@/components/PriceEditor';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';
import type { CostLine } from '@/lib/engine/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const item = await prisma.menuItem.findUnique({ where: { id: (await params).id } });
  return { title: item?.namePersian ?? 'آیتم منو' };
}

export default async function MenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: user.restaurantId },
    include: {
      category: true,
      recipe: { include: { versions: { orderBy: { version: 'desc' }, take: 5 } } },
      modifierGroups: { include: { modifier: true } },
    },
  });
  if (!item) notFound();

  const [restaurant, costed, profile, recentSnapshots] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    costOneMenuItem(user.restaurantId, id),
    resolveCostingProfile(user.restaurantId, item.costingProfileId),
    prisma.costSnapshot.findMany({
      where: { menuItemId: id },
      orderBy: { capturedAt: 'desc' },
      take: 1,
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const totalCost = Number(costed.totalCost);
  const price = Number(costed.sellingPrice);

  return (
    <>
      <div className="mb-4">
        <Link href="/menu-items" className="text-2xs text-ink-600 hover:text-forest-500">
          ← بازگشت به آیتم‌های منو
        </Link>
      </div>

      <PageHeader
        title={item.namePersian}
        subtitle={`${item.category.namePersian} — ${item.name}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/menu-items/${id}/cost`} className="btn-primary text-2xs py-1.5">
              ساخت و ویرایش قیمت
            </Link>
            {item.isFeatured && <Badge tone="accent">ویژه</Badge>}
            <Badge tone={
              item.availability === 'AVAILABLE' ? 'positive'
                : item.availability === 'UNAVAILABLE' ? 'negative' : 'neutral'
            }>
              {item.availability === 'AVAILABLE' ? 'موجود'
                : item.availability === 'UNAVAILABLE' ? 'ناموجود' : 'مخفی'}
            </Badge>
          </div>
        }
      />

      {/* The headline answer. */}
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="label">قیمت تمام‌شده هر پرس</p>
            <p className="mt-1 text-3xl font-bold tabular text-ink-900">
              {formatCurrency(totalCost, { symbol })}
            </p>
          </div>
          <div>
            <p className="label">قیمت فروش</p>
            <p className="mt-1 text-3xl font-bold tabular text-forest-500">
              {formatCurrency(price, { symbol })}
            </p>
          </div>
          <div>
            <p className="label">سود ناخالص هر پرس</p>
            <p className={`mt-1 text-3xl font-bold tabular ${
              costed.isUnprofitable ? 'text-pomegranate-400' : 'text-pistachio-400'
            }`}>
              {formatCurrency(costed.grossProfit, { symbol })}
            </p>
          </div>
          <div>
            <p className="label">حاشیه سود</p>
            <p className={`mt-1 text-3xl font-bold tabular ${
              costed.isUnprofitable ? 'text-pomegranate-400'
                : costed.isBelowMinimumMargin ? 'text-forest-500' : 'text-pistachio-400'
            }`}>
              {formatPercent(costed.grossMarginPct)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <CostBar
            ingredientCost={costed.ingredientCost}
            subRecipeCost={costed.subRecipeCost}
            laborCost={costed.laborCost}
            packagingCost={costed.packagingCost}
            overheadCost={costed.overheadCost}
            sellingPrice={costed.sellingPrice}
            symbol={symbol}
            height="h-4"
          />
        </div>

        {costed.isBelowMinimumMargin && (
          <p className="mt-4 rounded-lg border border-forest-500/30 bg-forest-500/10 px-3 py-2 text-2xs leading-6 text-forest-400">
            حاشیه سود این آیتم ({formatPercent(costed.grossMarginPct)}) از حداقل تعیین‌شده
            ({formatPercent(Number(profile.minimumMargin), { decimals: 0 })}) کمتر است.
            قیمت پیشنهادی برای رسیدن به هدف: {formatCurrency(costed.recommendedPrice, { symbol })}.
          </p>
        )}
      </section>

      <div className="mt-4 grid lg:grid-cols-3 gap-4">
        {/* Cost components */}
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">اجزای قیمت تمام‌شده</h2>
          <dl className="mt-3 space-y-2">
            <CostRow label="مواد اولیه" value={costed.ingredientCost} symbol={symbol} />
            <CostRow label="دستورهای میانی" value={costed.subRecipeCost} symbol={symbol} />
            <CostRow label="بسته‌بندی" value={costed.packagingCost} symbol={symbol} />
            <CostRow
              label={`نیروی کار (${faDigits(costed.laborMinutes)} دقیقه)`}
              value={costed.laborCost} symbol={symbol}
            />
            <CostRow label="سربار تخصیص‌یافته" value={costed.overheadCost} symbol={symbol} />
            <CostRow label="اثر ضایعات و افت" value={costed.wasteAdjustment} symbol={symbol} muted />
            <div className="flex items-center justify-between border-t border-ink-200 pt-2">
              <dt className="text-sm font-semibold text-ink-800">مجموع</dt>
              <dd className="text-sm font-bold tabular text-ink-900">
                {formatCurrency(totalCost, { symbol })}
              </dd>
            </div>
          </dl>
        </section>

        {/* Price control */}
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">قیمت‌گذاری</h2>
          <dl className="mt-3 space-y-2 text-2xs">
            <div className="flex justify-between">
              <dt className="text-ink-600">پروفایل</dt>
              <dd className="text-ink-700">{profile.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">هدف حاشیه سود</dt>
              <dd className="tabular text-ink-700">{formatPercent(Number(profile.targetGrossMargin), { decimals: 0 })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">قیمت پیشنهادی (خام)</dt>
              <dd className="tabular text-ink-600">{formatCurrency(costed.rawRecommendedPrice)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">پس از گرد کردن</dt>
              <dd className="tabular text-forest-500 font-semibold">
                {formatCurrency(costed.recommendedPrice, { symbol })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">مالیات ({formatPercent(Number(profile.taxRate), { decimals: 0 })})</dt>
              <dd className="tabular text-ink-700">{formatCurrency(costed.taxAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-600">قیمت بدون مالیات</dt>
              <dd className="tabular text-ink-700">{formatCurrency(costed.priceExcludingTax)}</dd>
            </div>
          </dl>

          <div className="mt-4 border-t border-ink-200 pt-4">
            <PriceEditor
              menuItemId={item.id}
              currentPrice={item.sellingPrice?.toString() ?? costed.recommendedPrice}
              recommendedPrice={costed.recommendedPrice}
              isOverridden={item.priceIsOverridden}
              symbol={symbol}
            />
          </div>
        </section>

        {/* Ratios */}
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">نسبت‌ها</h2>
          <dl className="mt-3 space-y-3">
            <RatioRow label="درصد مواد اولیه" value={costed.foodCostPct} target={Number(profile.targetFoodCostPct)} />
            <RatioRow label="درصد نیروی کار" value={costed.laborCostPct} />
            <RatioRow label="درصد سربار" value={costed.overheadCostPct} />
            <RatioRow label="هزینه اولیه (Prime)" value={costed.primeCostPct} />
          </dl>

          {item.modifierGroups.length > 0 && (
            <div className="mt-4 border-t border-ink-200 pt-3">
              <p className="label mb-2">افزودنی‌ها</p>
              <ul className="space-y-1">
                {item.modifierGroups.map((g) => (
                  <li key={g.id} className="flex justify-between text-2xs">
                    <span className="text-ink-600">{g.modifier.namePersian}</span>
                    <span className="tabular text-ink-600">
                      {Number(g.modifier.priceDelta) > 0
                        ? `+${formatCurrency(g.modifier.priceDelta.toString())}`
                        : 'رایگان'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* BOM breakdown — why it costs what it costs. */}
      <section className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">
          ریز مواد مصرفی
          {item.recipe && (
            <span className="mr-2 font-normal text-2xs text-ink-600">
              {item.recipe.namePersian} — نسخه {faDigits(item.recipe.currentVersion)}
            </span>
          )}
        </h2>
        {costed.lines.length === 0 ? (
          <div className="card p-8 text-center text-2xs text-ink-600">
            برای این آیتم دستور پختی ثبت نشده است.
          </div>
        ) : (
          <Table>
            <thead>
              <tr className="border-b border-ink-200">
                <th className="th">ماده / دستور</th>
                <th className="th">مقدار</th>
                <th className="th">مقدار مؤثر</th>
                <th className="th">قیمت واحد</th>
                <th className="th">قیمت واحد مؤثر</th>
                <th className="th">هزینه</th>
                <th className="th">سهم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {costed.lines.map((line, index) => (
                <CostLineRows key={index} line={line} totalCost={totalCost} depth={0} />
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-2 text-2xs leading-6 text-ink-600">
          «مقدار مؤثر» مقداری است که واقعاً از انبار کم می‌شود — یعنی مقدار دستور پخت پس از
          احتساب افت (Yield) و ضایعات. «قیمت واحد مؤثر» نیز قیمت هر واحد قابل‌استفاده است،
          نه قیمت خرید خام.
        </p>
      </section>

      {/* Formula audit — every number, and how it was produced. */}
      <section className="mt-4 card p-4">
        <h2 className="text-sm font-semibold text-ink-800">فرمول‌های محاسبه</h2>
        <p className="mt-1 text-2xs text-ink-600">
          هر عددی که در این صفحه می‌بینید از این فرمول‌ها به دست آمده است.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="th">مقدار</th>
                <th className="th">فرمول</th>
                <th className="th">جایگذاری</th>
                <th className="th">نتیجه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {costed.formulas.map((formula, index) => (
                <tr key={index}>
                  <td className="td">{formula.labelPersian}</td>
                  <td className="td font-mono text-2xs text-ink-600" dir="ltr">{formula.expression}</td>
                  <td className="td font-mono text-2xs text-ink-600" dir="ltr">{formula.substituted}</td>
                  <td className="td tabular text-ink-800" dir="ltr">
                    {Number(formula.result).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recipe version history */}
      {item.recipe && item.recipe.versions.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">تاریخچه نسخه‌های دستور پخت</h2>
          <Table>
            <thead>
              <tr className="border-b border-ink-200">
                <th className="th">نسخه</th>
                <th className="th">تاریخ</th>
                <th className="th">قیمت تمام‌شده وقت ثبت</th>
                <th className="th">توضیح</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {item.recipe.versions.map((version) => (
                <tr key={version.id}>
                  <td className="td tabular">{faDigits(version.version)}</td>
                  <td className="td text-ink-600">{formatJalali(version.createdAt)}</td>
                  <td className="td tabular">{formatCurrency(version.costPerPortion.toString(), { symbol })}</td>
                  <td className="td text-ink-600">{version.changeNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {recentSnapshots[0] && (
            <p className="mt-2 text-2xs text-ink-600">
              آخرین ثبت هزینه هنگام فروش: {formatJalali(recentSnapshots[0].capturedAt)} —
              {' '}{formatCurrency(recentSnapshots[0].totalCost.toString(), { symbol })}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function CostRow({
  label, value, symbol, muted = false,
}: { label: string; value: string; symbol: string; muted?: boolean }) {
  if (Number(value) === 0 && muted) return null;
  return (
    <div className="flex items-center justify-between">
      <dt className={`text-2xs ${muted ? 'text-ink-600' : 'text-ink-600'}`}>{label}</dt>
      <dd className={`text-sm tabular ${muted ? 'text-ink-600' : 'text-ink-700'}`}>
        {formatCurrency(value, { symbol })}
      </dd>
    </div>
  );
}

function RatioRow({ label, value, target }: { label: string; value: string; target?: number }) {
  const n = Number(value);
  const width = Math.min(100, Math.max(0, n * 100));
  const overTarget = target !== undefined && n > target;
  return (
    <div>
      <div className="flex items-center justify-between text-2xs">
        <span className="text-ink-600">{label}</span>
        <span className={`tabular ${overTarget ? 'text-forest-500' : 'text-ink-700'}`}>
          {formatPercent(value)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${overTarget ? 'bg-forest-500' : 'bg-ink-500'}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/** Renders a BOM line, then its sub-recipe children indented beneath it. */
function CostLineRows({
  line, totalCost, depth,
}: { line: CostLine; totalCost: number; depth: number }) {
  const share = totalCost > 0 ? Number(line.totalCost) / totalCost : 0;

  return (
    <>
      <tr className={depth > 0 ? 'bg-ink-50/40' : ''}>
        <td className="td" style={{ paddingRight: `${1 + depth * 1.25}rem` }}>
          <span className={depth > 0 ? 'text-ink-600' : 'text-ink-800'}>
            {depth > 0 && <span className="text-ink-400 ml-1.5">└</span>}
            {line.namePersian}
          </span>
          {line.kind === 'SUB_RECIPE' && (
            <span className="mr-2 rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-600">
              دستور میانی
            </span>
          )}
          {line.isPackaging && (
            <span className="mr-2 rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-600">
              بسته‌بندی
            </span>
          )}
        </td>
        <td className="td tabular text-ink-600">
          {faDigits(Number(line.quantity).toLocaleString('en-US', { maximumFractionDigits: 3 }))}
          <span className="mr-1 text-ink-400">{line.unitCode}</span>
        </td>
        <td className="td tabular text-ink-600">
          {faDigits(Number(line.effectiveQuantity).toLocaleString('en-US', { maximumFractionDigits: 2 }))}
        </td>
        <td className="td tabular text-ink-600">
          {formatCurrency(line.baseUnitCost, { decimals: 2 })}
        </td>
        <td className="td tabular text-ink-600">
          {formatCurrency(line.effectiveUnitCost, { decimals: 2 })}
        </td>
        <td className="td tabular text-ink-800">{formatCurrency(line.totalCost)}</td>
        <td className="td">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full bg-ink-500" style={{ width: `${Math.min(100, share * 100)}%` }} />
            </div>
            <span className="tabular text-2xs text-ink-600">{formatPercent(share, { decimals: 0 })}</span>
          </div>
        </td>
      </tr>
      {line.children?.map((child, index) => (
        <CostLineRows key={index} line={child} totalCost={totalCost} depth={depth + 1} />
      ))}
    </>
  );
}
