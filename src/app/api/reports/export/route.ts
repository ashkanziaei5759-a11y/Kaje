import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getItemPerformance, getSalesSummary, getExpenseSummary,
  getCostVariance, resolveRange, type RangePreset,
} from '@/server/services/reports';
import { getStockAlerts } from '@/server/services/inventory';
import { costAllMenuItems } from '@/server/services/costing';
import { toCsv, csvResponse } from '@/server/services/export';
import { formatJalali } from '@/lib/jalali';

const VALID_RANGES: RangePreset[] = [
  'today', 'yesterday', 'this_week', 'this_month', 'last_month', 'this_year',
];

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.REPORT_EXPORT);
    const url = new URL(request.url);
    const report = url.searchParams.get('report') ?? 'item-profitability';
    const rangeParam = url.searchParams.get('range') ?? 'this_month';
    const preset = (VALID_RANGES.includes(rangeParam as RangePreset)
      ? rangeParam : 'this_month') as RangePreset;
    const range = resolveRange(preset);
    const stamp = formatJalali(new Date(), 'short', false).replace(/\//g, '-');

    switch (report) {
      case 'item-profitability': {
        const rows = await getItemPerformance(user.restaurantId, range);
        return csvResponse(
          `سودآوری-آیتم-${stamp}.csv`,
          toCsv(
            ['آیتم', 'نام انگلیسی', 'تعداد فروش', 'فروش', 'قیمت تمام‌شده', 'سود', 'حاشیه سود'],
            rows.map((r) => [r.namePersian, r.name, r.unitsSold, r.revenue, r.cost, r.profit, r.marginPct]),
          ),
        );
      }

      case 'menu-costing': {
        const rows = await costAllMenuItems(user.restaurantId);
        return csvResponse(
          `قیمت-تمام-شده-${stamp}.csv`,
          toCsv(
            ['آیتم', 'مواد اولیه', 'دستور میانی', 'بسته‌بندی', 'نیروی کار',
             'سربار', 'قیمت تمام‌شده', 'قیمت فروش', 'سود', 'حاشیه سود',
             'درصد مواد اولیه', 'قیمت پیشنهادی'],
            rows.map((r) => [
              r.namePersian, r.ingredientCost, r.subRecipeCost, r.packagingCost,
              r.laborCost, r.overheadCost, r.totalCost, r.sellingPrice,
              r.grossProfit, r.grossMarginPct, r.foodCostPct, r.recommendedPrice,
            ]),
          ),
        );
      }

      case 'inventory': {
        const rows = await getStockAlerts(user.restaurantId);
        const levels = await prisma.stockLevel.findMany({
          where: { ingredient: { restaurantId: user.restaurantId } },
          include: { ingredient: true },
        });
        return csvResponse(
          `موجودی-انبار-${stamp}.csv`,
          toCsv(
            ['ماده اولیه', 'موجودی', 'میانگین قیمت واحد', 'ارزش', 'حداقل موجودی', 'حد سفارش'],
            levels.map((l) => [
              l.ingredient.namePersian,
              l.quantity.toString(),
              l.avgUnitCost.toString(),
              (Number(l.quantity) * Number(l.avgUnitCost)).toFixed(2),
              l.ingredient.minimumStock.toString(),
              l.ingredient.reorderLevel.toString(),
            ]),
          ),
        );
      }

      case 'price-history': {
        const history = await prisma.ingredientPriceHistory.findMany({
          where: { ingredient: { restaurantId: user.restaurantId } },
          include: { ingredient: true, supplier: true },
          orderBy: { effectiveAt: 'desc' },
          take: 2000,
        });
        return csvResponse(
          `تغییرات-قیمت-${stamp}.csv`,
          toCsv(
            ['تاریخ', 'ماده اولیه', 'تأمین‌کننده', 'قیمت قبلی', 'قیمت جدید', 'درصد تغییر', 'منبع'],
            history.map((h) => [
              formatJalali(h.effectiveAt, 'short', false),
              h.ingredient.namePersian,
              h.supplier?.namePersian ?? '',
              h.previousPrice?.toString() ?? '',
              h.price.toString(),
              h.changePercent?.toString() ?? '',
              h.source,
            ]),
          ),
        );
      }

      case 'waste': {
        const wastes = await prisma.waste.findMany({
          where: {
            restaurantId: user.restaurantId,
            occurredAt: { gte: range.from, lte: range.to },
          },
          include: { ingredient: true, user: true },
          orderBy: { occurredAt: 'desc' },
        });
        return csvResponse(
          `ضایعات-${stamp}.csv`,
          toCsv(
            ['تاریخ', 'ماده اولیه', 'مقدار', 'قیمت واحد', 'هزینه', 'علت', 'کاربر', 'یادداشت'],
            wastes.map((w) => [
              formatJalali(w.occurredAt, 'short', false),
              w.ingredient.namePersian,
              w.quantity.toString(),
              w.unitCost.toString(),
              Math.abs(Number(w.totalCost)).toFixed(2),
              w.reason,
              w.user?.name ?? '',
              w.notes ?? '',
            ]),
          ),
        );
      }

      case 'profit-loss': {
        const [summary, expenses, variance] = await Promise.all([
          getSalesSummary(user.restaurantId, range),
          getExpenseSummary(user.restaurantId, range),
          getCostVariance(user.restaurantId, range),
        ]);
        const net = Number(summary.grossProfit) - Number(expenses.total);
        return csvResponse(
          `سود-و-زیان-${stamp}.csv`,
          toCsv(
            ['شرح', 'مبلغ'],
            [
              ['فروش خالص', summary.revenue],
              ['هزینه مواد اولیه', summary.foodCost],
              ['هزینه نیروی کار', summary.laborCost],
              ['سربار تخصیص‌یافته', summary.overheadCost],
              ['سود ناخالص', summary.grossProfit],
              ['حاشیه سود ناخالص', summary.grossMarginPct],
              ['هزینه‌های عملیاتی', expenses.total],
              ['سود خالص', net.toFixed(2)],
              ['درصد مواد اولیه', summary.foodCostPct],
              ['هزینه اولیه (Prime)', summary.primeCostPct],
              ['هزینه تئوریک', variance.theoreticalCost],
              ['هزینه واقعی', variance.actualCost],
              ['انحراف', variance.variance],
              ['درصد انحراف', variance.variancePct],
            ],
          ),
        );
      }

      default:
        return NextResponse.json({ error: 'گزارش ناشناخته' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Report export failed:', error);
    return NextResponse.json({ error: 'تهیه گزارش انجام نشد' }, { status: 500 });
  }
}
