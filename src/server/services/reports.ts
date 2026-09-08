/**
 * Reporting & dashboard aggregation.
 *
 * Every figure here comes from CostSnapshot rather than from a live re-costing.
 * That is the whole point of snapshots: a P&L for last month must reflect last
 * month's ingredient prices, not today's.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { Decimal, d, money, percent, ratio } from '@/lib/money';
import { analyseMenu, analyseVariance } from '@/lib/engine/menu-engineering';
import { getInventoryValuation, getStockAlerts } from './inventory';

export interface DateRange {
  from: Date;
  to: Date;
}

export type RangePreset =
  | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_year';

/**
 * Resolves a preset into an absolute range.
 * The Iranian week runs Saturday→Friday, so week boundaries are computed against
 * Saturday rather than the JS default of Sunday.
 */
export function resolveRange(preset: RangePreset, now = new Date()): DateRange {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_week': {
      // getDay(): 0=Sun … 6=Sat. Saturday is the start of the Iranian week.
      const daysSinceSaturday = (now.getDay() + 1) % 7;
      const start = new Date(now);
      start.setDate(start.getDate() - daysSinceSaturday);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    case 'this_month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case 'last_month':
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'this_year':
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

export interface SalesSummary {
  revenue: string;
  cost: string;
  grossProfit: string;
  grossMarginPct: string;
  unitsSold: number;
  orderCount: number;
  averageOrderValue: string;
  foodCost: string;
  foodCostPct: string;
  laborCost: string;
  laborCostPct: string;
  overheadCost: string;
  primeCostPct: string;
}

/** Sales + cost roll-up for a period, read entirely from cost snapshots. */
export async function getSalesSummary(
  restaurantId: string,
  range: DateRange,
): Promise<SalesSummary> {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      placedAt: { gte: range.from, lte: range.to },
    },
    include: { items: { include: { costSnapshot: true } } },
  });

  let revenue = d(0), foodCost = d(0), laborCost = d(0), overheadCost = d(0);
  let packagingCost = d(0), totalCost = d(0), unitsSold = 0;

  for (const order of orders) {
    for (const line of order.items) {
      const quantity = d(line.quantity);
      unitsSold += line.quantity;
      revenue = revenue.plus(d(line.lineTotal));

      const snap = line.costSnapshot;
      if (!snap) continue;
      foodCost = foodCost.plus(d(snap.ingredientCost).plus(d(snap.subRecipeCost)).times(quantity));
      laborCost = laborCost.plus(d(snap.laborCost).times(quantity));
      overheadCost = overheadCost.plus(d(snap.overheadCost).times(quantity));
      packagingCost = packagingCost.plus(d(snap.packagingCost).times(quantity));
      totalCost = totalCost.plus(d(snap.totalCost).times(quantity));
    }
  }

  const grossProfit = revenue.minus(totalCost);

  return {
    revenue: money(revenue).toFixed(),
    cost: money(totalCost).toFixed(),
    grossProfit: money(grossProfit).toFixed(),
    grossMarginPct: percent(ratio(grossProfit, revenue)).toFixed(),
    unitsSold,
    orderCount: orders.length,
    averageOrderValue: money(
      orders.length > 0 ? revenue.dividedBy(orders.length) : d(0),
    ).toFixed(),
    foodCost: money(foodCost).toFixed(),
    foodCostPct: percent(ratio(foodCost, revenue)).toFixed(),
    laborCost: money(laborCost).toFixed(),
    laborCostPct: percent(ratio(laborCost, revenue)).toFixed(),
    overheadCost: money(overheadCost).toFixed(),
    // Prime cost — food + labor — is the number restaurant operators actually
    // manage. Under ~60% of revenue is the usual health line.
    primeCostPct: percent(ratio(foodCost.plus(laborCost), revenue)).toFixed(),
  };
}

export interface ItemPerformanceRow {
  menuItemId: string;
  name: string;
  namePersian: string;
  unitsSold: number;
  revenue: string;
  cost: string;
  profit: string;
  marginPct: string;
}

/** Per-item sales performance for the period, from snapshots. */
export async function getItemPerformance(
  restaurantId: string,
  range: DateRange,
): Promise<ItemPerformanceRow[]> {
  const lines = await prisma.orderItem.findMany({
    where: {
      order: {
        restaurantId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        placedAt: { gte: range.from, lte: range.to },
      },
    },
    include: { menuItem: true, costSnapshot: true },
  });

  const byItem = new Map<string, {
    name: string; namePersian: string; unitsSold: number;
    revenue: Decimal; cost: Decimal;
  }>();

  for (const line of lines) {
    const key = line.menuItemId;
    const current = byItem.get(key) ?? {
      name: line.menuItem.name,
      namePersian: line.menuItem.namePersian,
      unitsSold: 0,
      revenue: d(0),
      cost: d(0),
    };
    current.unitsSold += line.quantity;
    current.revenue = current.revenue.plus(d(line.lineTotal));
    if (line.costSnapshot) {
      current.cost = current.cost.plus(d(line.costSnapshot.totalCost).times(line.quantity));
    }
    byItem.set(key, current);
  }

  return [...byItem.entries()]
    .map(([menuItemId, v]) => {
      const profit = v.revenue.minus(v.cost);
      return {
        menuItemId,
        name: v.name,
        namePersian: v.namePersian,
        unitsSold: v.unitsSold,
        revenue: money(v.revenue).toFixed(),
        cost: money(v.cost).toFixed(),
        profit: money(profit).toFixed(),
        marginPct: percent(ratio(profit, v.revenue)).toFixed(),
      };
    })
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

/** Menu engineering over a period. */
export async function getMenuEngineering(restaurantId: string, range: DateRange) {
  const rows = await getItemPerformance(restaurantId, range);
  return analyseMenu(
    rows
      .filter((r) => r.unitsSold > 0)
      .map((r) => ({
        menuItemId: r.menuItemId,
        name: r.name,
        namePersian: r.namePersian,
        unitsSold: r.unitsSold,
        sellingPrice: d(r.revenue).dividedBy(r.unitsSold),
        totalCost: d(r.cost).dividedBy(r.unitsSold),
      })),
  );
}

/** Expenses grouped by category for the period. */
export async function getExpenseSummary(restaurantId: string, range: DateRange) {
  const expenses = await prisma.expense.findMany({
    where: { restaurantId, expenseDate: { gte: range.from, lte: range.to } },
    include: { category: true },
  });

  const byCategory = new Map<string, { name: string; namePersian: string; amount: Decimal; isOverhead: boolean; isLabor: boolean }>();
  let total = d(0), overhead = d(0), labor = d(0);

  for (const e of expenses) {
    total = total.plus(d(e.amount));
    if (e.category.isLabor) labor = labor.plus(d(e.amount));
    else if (e.category.isOverhead) overhead = overhead.plus(d(e.amount));

    const current = byCategory.get(e.categoryId) ?? {
      name: e.category.name, namePersian: e.category.namePersian,
      amount: d(0), isOverhead: e.category.isOverhead, isLabor: e.category.isLabor,
    };
    current.amount = current.amount.plus(d(e.amount));
    byCategory.set(e.categoryId, current);
  }

  return {
    total: money(total).toFixed(),
    overhead: money(overhead).toFixed(),
    labor: money(labor).toFixed(),
    byCategory: [...byCategory.values()]
      .map((c) => ({ ...c, amount: money(c.amount).toFixed() }))
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
  };
}

/**
 * Actual vs theoretical food cost for a period.
 *
 * Theoretical comes from the recipes behind what was sold; actual from
 * opening stock + purchases - closing stock. Opening and closing are
 * reconstructed from the ledger, so the report works even before the first
 * formal stock count.
 */
export async function getCostVariance(restaurantId: string, range: DateRange) {
  const [summary, purchases, wastes, closingValue] = await Promise.all([
    getSalesSummary(restaurantId, range),
    prisma.purchase.aggregate({
      where: {
        restaurantId, status: 'APPROVED',
        purchaseDate: { gte: range.from, lte: range.to },
      },
      _sum: { totalAmount: true },
    }),
    prisma.waste.aggregate({
      where: { restaurantId, occurredAt: { gte: range.from, lte: range.to } },
      _sum: { totalCost: true },
    }),
    getInventoryValuation(restaurantId),
  ]);

  // Roll the closing valuation backwards over the period's movements to get
  // the opening position.
  const movements = await prisma.inventoryTransaction.aggregate({
    where: {
      ingredient: { restaurantId },
      occurredAt: { gte: range.from, lte: range.to },
    },
    _sum: { totalCost: true },
  });
  const openingValue = closingValue.minus(d(movements._sum.totalCost ?? 0));

  return analyseVariance({
    theoreticalCost: summary.foodCost,
    openingInventory: openingValue,
    purchases: purchases._sum.totalAmount ?? 0,
    closingInventory: closingValue,
    recordedWaste: wastes._sum.totalCost?.abs() ?? 0,
    revenue: summary.revenue,
  });
}

/** Everything the dashboard needs, in one call. */
export async function getDashboard(restaurantId: string, range: DateRange) {
  const [
    summary, itemPerformance, expenses, stockAlerts, inventoryValue,
    recentPurchases, recentExpenses, priceIncreases, alerts, wasteTotal,
  ] = await Promise.all([
    getSalesSummary(restaurantId, range),
    getItemPerformance(restaurantId, range),
    getExpenseSummary(restaurantId, range),
    getStockAlerts(restaurantId),
    getInventoryValuation(restaurantId),
    prisma.purchase.findMany({
      where: { restaurantId, status: 'APPROVED' },
      include: { supplier: true },
      orderBy: { purchaseDate: 'desc' },
      take: 5,
    }),
    prisma.expense.findMany({
      where: { restaurantId },
      include: { category: true },
      orderBy: { expenseDate: 'desc' },
      take: 5,
    }),
    prisma.ingredientPriceHistory.findMany({
      where: {
        ingredient: { restaurantId },
        changePercent: { gt: 0 },
        effectiveAt: { gte: range.from },
      },
      include: { ingredient: true },
      orderBy: { changePercent: 'desc' },
      take: 5,
    }),
    prisma.alert.findMany({
      where: { restaurantId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.waste.aggregate({
      where: { restaurantId, occurredAt: { gte: range.from, lte: range.to } },
      _sum: { totalCost: true },
    }),
  ]);

  const netProfit = d(summary.grossProfit).minus(d(expenses.total));

  return {
    summary,
    netProfit: money(netProfit).toFixed(),
    netMarginPct: percent(ratio(netProfit, summary.revenue)).toFixed(),
    expenses,
    wasteCost: money(wasteTotal._sum.totalCost ?? 0).toFixed(),
    inventoryValue: inventoryValue.toFixed(),
    bestSellers: [...itemPerformance].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 5),
    mostProfitable: [...itemPerformance].sort((a, b) => Number(b.profit) - Number(a.profit)).slice(0, 5),
    lowestMargin: [...itemPerformance]
      .filter((i) => i.unitsSold > 0)
      .sort((a, b) => Number(a.marginPct) - Number(b.marginPct))
      .slice(0, 5),
    lowStock: stockAlerts.filter((s) => s.status === 'LOW' || s.status === 'CRITICAL'),
    outOfStock: stockAlerts.filter((s) => s.status === 'OUT_OF_STOCK'),
    recentPurchases: recentPurchases.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      supplier: p.supplier.namePersian ?? p.supplier.name,
      amount: p.totalAmount.toString(),
      date: p.purchaseDate.toISOString(),
    })),
    recentExpenses: recentExpenses.map((e) => ({
      id: e.id,
      category: e.category.namePersian,
      amount: e.amount.toString(),
      date: e.expenseDate.toISOString(),
      description: e.description,
    })),
    priceIncreases: priceIncreases.map((p) => ({
      ingredient: p.ingredient.namePersian,
      price: p.price.toString(),
      previousPrice: p.previousPrice?.toString() ?? null,
      changePercent: p.changePercent?.toString() ?? null,
      date: p.effectiveAt.toISOString(),
    })),
    alerts: alerts.map((a) => ({
      id: a.id, type: a.type, severity: a.severity,
      title: a.title, message: a.message, createdAt: a.createdAt.toISOString(),
    })),
  };
}

/** Daily revenue/cost series for the dashboard chart. */
export async function getDailySeries(restaurantId: string, range: DateRange) {
  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: { in: ['CONFIRMED', 'COMPLETED'] },
      placedAt: { gte: range.from, lte: range.to },
    },
    select: { placedAt: true, totalAmount: true, totalCost: true },
    orderBy: { placedAt: 'asc' },
  });

  const byDay = new Map<string, { revenue: Decimal; cost: Decimal; orders: number }>();
  for (const order of orders) {
    const key = order.placedAt.toISOString().slice(0, 10);
    const current = byDay.get(key) ?? { revenue: d(0), cost: d(0), orders: 0 };
    current.revenue = current.revenue.plus(d(order.totalAmount));
    current.cost = current.cost.plus(d(order.totalCost));
    current.orders += 1;
    byDay.set(key, current);
  }

  return [...byDay.entries()]
    .map(([date, v]) => ({
      date,
      revenue: Number(money(v.revenue).toFixed()),
      cost: Number(money(v.cost).toFixed()),
      profit: Number(money(v.revenue.minus(v.cost)).toFixed()),
      orders: v.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
