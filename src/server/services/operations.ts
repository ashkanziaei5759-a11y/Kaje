import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma, TX_TIMEOUT_MS } from '@/lib/db';
import { d } from '@/lib/money';
import { recordMovement } from './inventory';
import { computePurchaseTotals } from './purchasing';

/**
 * Day-to-day operations: recording what a restaurant actually does — goods
 * arriving, food thrown away, money spent, stock counted.
 *
 * These are the writes the cost engine reads from. A purchase moves the
 * weighted average price, which moves every recipe that uses the ingredient,
 * which moves the recommended selling price. Nothing here recomputes costs
 * itself; it records the fact and lets the engine derive the consequences.
 */

export class OperationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'OperationError';
  }
}

/** Resolves the branch and warehouse a write lands in when none is named. */
export async function defaultLocation(restaurantId: string) {
  const branch = await prisma.branch.findFirst({
    where: { restaurantId, isActive: true },
    orderBy: { createdAt: 'asc' },
    include: {
      warehouses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], take: 1 },
    },
  });
  if (!branch) throw new OperationError('این رستوران هیچ شعبه فعالی ندارد', 'NO_BRANCH');
  const warehouse = branch.warehouses[0];
  if (!warehouse) throw new OperationError('این شعبه هیچ انباری ندارد', 'NO_WAREHOUSE');
  return { branchId: branch.id, warehouseId: warehouse.id };
}

// ── Purchases ────────────────────────────────────────────────────────────────

export interface PurchaseLineInput {
  ingredientId: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  taxAmount?: string;
  notes?: string | null;
}

/**
 * Creates a purchase. Approving it is a separate, permissioned step
 * (approvePurchase) because that is what moves stock and rewrites prices —
 * recording an invoice and accepting its financial consequences are different
 * decisions, often made by different people.
 */
export async function createPurchase(args: {
  restaurantId: string;
  userId: string;
  supplierId: string;
  purchaseDate: Date;
  invoiceNumber?: string | null;
  discountAmount?: string;
  taxAmount?: string;
  notes?: string | null;
  lines: PurchaseLineInput[];
  approve: boolean;
}) {
  if (args.lines.length === 0) {
    throw new OperationError('فاکتور باید حداقل یک قلم داشته باشد', 'NO_ITEMS');
  }

  const { branchId } = await defaultLocation(args.restaurantId);

  const supplier = await prisma.supplier.findFirst({
    where: { id: args.supplierId, restaurantId: args.restaurantId },
  });
  if (!supplier) throw new OperationError('تأمین‌کننده معتبر نیست', 'BAD_SUPPLIER');

  // Every ingredient must belong to this restaurant, and each line is priced in
  // that ingredient's own purchase unit — the unit the invoice is written in.
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: args.lines.map((l) => l.ingredientId) }, restaurantId: args.restaurantId },
    select: { id: true, purchaseUnitId: true },
  });
  const unitOf = new Map(ingredients.map((i) => [i.id, i.purchaseUnitId]));
  for (const line of args.lines) {
    if (!unitOf.has(line.ingredientId)) {
      throw new OperationError('یکی از مواد اولیه انتخاب‌شده معتبر نیست', 'BAD_INGREDIENT');
    }
    if (d(line.quantity).lessThanOrEqualTo(0)) {
      throw new OperationError('مقدار هر قلم باید بزرگ‌تر از صفر باشد', 'BAD_QUANTITY');
    }
    if (d(line.unitPrice).lessThan(0)) {
      throw new OperationError('قیمت واحد نمی‌تواند منفی باشد', 'BAD_PRICE');
    }
  }

  const totals = computePurchaseTotals(
    args.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount ?? '0',
      taxAmount: l.taxAmount ?? '0',
    })),
  );

  // Invoice-level discount and tax sit on top of whatever the lines carry —
  // a supplier's "5% off the whole order" is not attributable to any one line.
  const invoiceDiscount = d(args.discountAmount ?? '0');
  const invoiceTax = d(args.taxAmount ?? '0');
  const discountAmount = totals.discountAmount.plus(invoiceDiscount);
  const taxAmount = totals.taxAmount.plus(invoiceTax);
  const totalAmount = totals.subtotal.minus(discountAmount).plus(taxAmount);

  const purchase = await prisma.purchase.create({
    data: {
      restaurantId: args.restaurantId,
      branchId,
      supplierId: args.supplierId,
      invoiceNumber: args.invoiceNumber || null,
      purchaseDate: args.purchaseDate,
      status: 'DRAFT',
      subtotal: totals.subtotal.toFixed(4),
      discountAmount: discountAmount.toFixed(4),
      taxAmount: taxAmount.toFixed(4),
      totalAmount: totalAmount.toFixed(4),
      notes: args.notes || null,
      createdById: args.userId,
      items: {
        create: args.lines.map((l, i) => ({
          ingredientId: l.ingredientId,
          quantity: l.quantity,
          unitId: unitOf.get(l.ingredientId)!,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount ?? '0',
          taxAmount: l.taxAmount ?? '0',
          lineTotal: totals.lineTotals[i].toFixed(4),
          notes: l.notes || null,
        })),
      },
    },
  });

  return purchase;
}

// ── Waste ────────────────────────────────────────────────────────────────────

/**
 * Logs waste and depletes stock in the same transaction.
 *
 * The cost is taken from the warehouse's weighted average at the moment of the
 * write, not from the ingredient's list price: what was thrown away cost what
 * it cost to buy, and recordMovement is the only thing that knows that number.
 */
export async function recordWaste(args: {
  restaurantId: string;
  userId: string;
  ingredientId: string;
  quantity: string;
  reason: string;
  notes?: string | null;
  occurredAt?: Date;
}) {
  const { branchId, warehouseId } = await defaultLocation(args.restaurantId);

  const ingredient = await prisma.ingredient.findFirst({
    where: { id: args.ingredientId, restaurantId: args.restaurantId },
    select: { id: true },
  });
  if (!ingredient) throw new OperationError('ماده اولیه معتبر نیست', 'BAD_INGREDIENT');
  if (d(args.quantity).lessThanOrEqualTo(0)) {
    throw new OperationError('مقدار ضایعات باید بزرگ‌تر از صفر باشد', 'BAD_QUANTITY');
  }

  return prisma.$transaction(async (tx) => {
    const waste = await tx.waste.create({
      data: {
        restaurantId: args.restaurantId,
        branchId,
        ingredientId: args.ingredientId,
        quantity: args.quantity,
        // Filled in below from the movement's own valuation.
        unitCost: '0',
        totalCost: '0',
        reason: args.reason as never,
        notes: args.notes || null,
        userId: args.userId,
        occurredAt: args.occurredAt ?? new Date(),
      },
    });

    const movement = await recordMovement(tx, {
      ingredientId: args.ingredientId,
      branchId,
      warehouseId,
      type: 'WASTE',
      quantity: args.quantity,
      referenceType: 'Waste',
      referenceId: waste.id,
      reason: args.reason,
      userId: args.userId,
      occurredAt: args.occurredAt,
    });

    return tx.waste.update({
      where: { id: waste.id },
      data: {
        // recordMovement signs its cost by direction — an issue is negative.
        // A waste row is a cost incurred, and every report sums it as such, so
        // it is stored as a magnitude; the ledger keeps the sign.
        unitCost: movement.unitCost.abs().toFixed(8),
        totalCost: movement.totalCost.abs().toFixed(4),
      },
      include: { ingredient: { select: { namePersian: true } } },
    });
  }, { timeout: TX_TIMEOUT_MS });
}

// ── Stock count ──────────────────────────────────────────────────────────────

/**
 * Records a physical count and posts the difference as an adjustment.
 *
 * The counted number wins: shrinkage, miscounts at receipt and unlogged waste
 * all end up here, and the ledger keeps the correction as its own signed entry
 * rather than silently overwriting the balance.
 */
export async function recordStockCount(args: {
  restaurantId: string;
  userId: string;
  lines: { ingredientId: string; countedQuantity: string }[];
  notes?: string | null;
}) {
  if (args.lines.length === 0) {
    throw new OperationError('حداقل یک قلم باید شمارش شود', 'NO_LINES');
  }
  const { branchId, warehouseId } = await defaultLocation(args.restaurantId);

  const owned = await prisma.ingredient.findMany({
    where: { id: { in: args.lines.map((l) => l.ingredientId) }, restaurantId: args.restaurantId },
    select: { id: true },
  });
  if (owned.length !== new Set(args.lines.map((l) => l.ingredientId)).size) {
    throw new OperationError('یکی از مواد اولیه معتبر نیست', 'BAD_INGREDIENT');
  }

  return prisma.$transaction(async (tx) => {
    const count = await tx.inventoryCount.create({
      data: {
        restaurantId: args.restaurantId,
        branchId,
        warehouseId,
        countedAt: new Date(),
        status: 'APPROVED',
        notes: args.notes || null,
        userId: args.userId,
      },
    });

    let adjusted = 0;
    let netQuantity = d(0);

    for (const line of args.lines) {
      const level = await tx.stockLevel.findUnique({
        where: { ingredientId_warehouseId: { ingredientId: line.ingredientId, warehouseId } },
      });
      const system = d(level?.quantity ?? 0);
      const counted = d(line.countedQuantity);
      const delta = counted.minus(system);
      // The variance is valued at what the stock was carried at, so a count
      // reports the money lost or found, not just a quantity.
      const unitCost = d(level?.avgUnitCost ?? 0);

      await tx.inventoryCountLine.create({
        data: {
          countId: count.id,
          ingredientId: line.ingredientId,
          expectedQty: system.toFixed(6),
          countedQty: counted.toFixed(6),
          varianceQty: delta.toFixed(6),
          unitCost: unitCost.toFixed(8),
          varianceValue: delta.times(unitCost).toFixed(4),
        },
      });

      // A count that matches the system is still worth recording as a line, but
      // posting a zero movement would only add noise to the ledger.
      if (delta.isZero()) continue;

      await recordMovement(tx, {
        ingredientId: line.ingredientId,
        branchId,
        warehouseId,
        type: 'ADJUSTMENT',
        quantity: delta,
        referenceType: 'InventoryCount',
        referenceId: count.id,
        reason: 'انبارگردانی',
        userId: args.userId,
      });
      adjusted += 1;
      netQuantity = netQuantity.plus(delta);
    }

    return { countId: count.id, linesCounted: args.lines.length, adjusted, netQuantity };
  }, { timeout: TX_TIMEOUT_MS });
}

// ── Expenses ─────────────────────────────────────────────────────────────────

export async function createExpense(args: {
  restaurantId: string;
  userId: string;
  categoryId: string;
  amount: string;
  type: string;
  expenseDate: Date;
  description?: string | null;
  payee?: string | null;
  supplierId?: string | null;
  isRecurring?: boolean;
  recurrenceInterval?: string | null;
}) {
  const category = await prisma.expenseCategory.findFirst({
    where: { id: args.categoryId, restaurantId: args.restaurantId },
  });
  if (!category) throw new OperationError('دستهٔ هزینه معتبر نیست', 'BAD_CATEGORY');
  if (d(args.amount).lessThanOrEqualTo(0)) {
    throw new OperationError('مبلغ باید بزرگ‌تر از صفر باشد', 'BAD_AMOUNT');
  }
  if (args.supplierId) {
    const supplier = await prisma.supplier.count({
      where: { id: args.supplierId, restaurantId: args.restaurantId },
    });
    if (supplier === 0) throw new OperationError('تأمین‌کننده معتبر نیست', 'BAD_SUPPLIER');
  }

  const { branchId } = await defaultLocation(args.restaurantId);

  return prisma.expense.create({
    data: {
      restaurantId: args.restaurantId,
      branchId,
      categoryId: args.categoryId,
      supplierId: args.supplierId || null,
      amount: args.amount,
      type: args.type as never,
      expenseDate: args.expenseDate,
      description: args.description || null,
      payee: args.payee || null,
      isRecurring: args.isRecurring ?? false,
      recurrenceInterval: args.recurrenceInterval || null,
      createdById: args.userId,
    },
    include: { category: true },
  });
}

// ── Reference data ───────────────────────────────────────────────────────────

export async function upsertSupplier(args: {
  restaurantId: string;
  id?: string | null;
  name: string;
  namePersian?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const data = {
    name: args.name,
    namePersian: args.namePersian || null,
    contactPerson: args.contactPerson || null,
    phone: args.phone || null,
    email: args.email || null,
    address: args.address || null,
    paymentTerms: args.paymentTerms || null,
    notes: args.notes || null,
    isActive: args.isActive ?? true,
  };

  if (args.id) {
    const existing = await prisma.supplier.count({
      where: { id: args.id, restaurantId: args.restaurantId },
    });
    if (existing === 0) throw new OperationError('تأمین‌کننده پیدا نشد', 'NOT_FOUND');
    return prisma.supplier.update({ where: { id: args.id }, data });
  }
  return prisma.supplier.create({ data: { ...data, restaurantId: args.restaurantId } });
}

export async function upsertEmployee(args: {
  restaurantId: string;
  id?: string | null;
  name: string;
  role: string;
  department?: string | null;
  phone?: string | null;
  salaryType: string;
  salaryAmount: string;
  monthlyHours: string;
  burdenPercent: string;
  hireDate?: Date | null;
  isActive?: boolean;
  notes?: string | null;
}) {
  if (d(args.salaryAmount).lessThan(0)) {
    throw new OperationError('حقوق نمی‌تواند منفی باشد', 'BAD_SALARY');
  }
  const burden = d(args.burdenPercent);
  if (burden.lessThan(0) || burden.greaterThan(1)) {
    throw new OperationError('بار بیمه و مزایا باید کسری بین ۰ و ۱ باشد (مثلاً ۰٫۲۳)', 'BAD_BURDEN');
  }
  // Hourly cost is salary ÷ hours, so zero hours on a salaried employee would
  // divide by zero the moment labour cost is allocated.
  if (args.salaryType !== 'HOURLY' && d(args.monthlyHours).lessThanOrEqualTo(0)) {
    throw new OperationError('ساعت کاری ماهانه باید بزرگ‌تر از صفر باشد', 'BAD_HOURS');
  }

  const data = {
    name: args.name,
    role: args.role,
    department: args.department || null,
    phone: args.phone || null,
    salaryType: args.salaryType as never,
    salaryAmount: args.salaryAmount,
    monthlyHours: args.monthlyHours,
    burdenPercent: args.burdenPercent,
    hireDate: args.hireDate ?? null,
    isActive: args.isActive ?? true,
    notes: args.notes || null,
  };

  if (args.id) {
    const existing = await prisma.employee.count({
      where: { id: args.id, restaurantId: args.restaurantId },
    });
    if (existing === 0) throw new OperationError('کارمند پیدا نشد', 'NOT_FOUND');
    return prisma.employee.update({ where: { id: args.id }, data });
  }
  return prisma.employee.create({ data: { ...data, restaurantId: args.restaurantId } });
}

export type { Prisma };

// ── New dishes ───────────────────────────────────────────────────────────────

export interface DishLineInput {
  ingredientId: string;
  /** In the ingredient's recipe unit — grams, millilitres, pieces. */
  quantity: string;
  wastePercent?: string;
}

/**
 * Creates a dish: its recipe (the bill of materials) and the menu item that
 * sells it, in one transaction.
 *
 * The selling price is deliberately left unset. It is the engine's job to say
 * what the dish costs and what it should sell for, and the manager's job to
 * accept or override that — inventing a price here would bury the one decision
 * the whole system exists to inform.
 */
export async function createDish(args: {
  restaurantId: string;
  categoryId: string;
  namePersian: string;
  description?: string | null;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  lines: DishLineInput[];
}) {
  if (args.lines.length === 0) {
    throw new OperationError('یک غذا باید حداقل یک ماده اولیه داشته باشد', 'NO_LINES');
  }

  const category = await prisma.menuCategory.findFirst({
    where: { id: args.categoryId, restaurantId: args.restaurantId },
  });
  if (!category) throw new OperationError('دستهٔ منو معتبر نیست', 'BAD_CATEGORY');

  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: args.lines.map((l) => l.ingredientId) }, restaurantId: args.restaurantId },
    select: { id: true, recipeUnitId: true },
  });
  const unitOf = new Map(ingredients.map((i) => [i.id, i.recipeUnitId]));
  for (const line of args.lines) {
    if (!unitOf.has(line.ingredientId)) {
      throw new OperationError('یکی از مواد اولیه معتبر نیست', 'BAD_INGREDIENT');
    }
    if (d(line.quantity).lessThanOrEqualTo(0)) {
      throw new OperationError('مقدار هر ماده باید بزرگ‌تر از صفر باشد', 'BAD_QUANTITY');
    }
  }

  const duplicate = await prisma.menuItem.findFirst({
    where: { restaurantId: args.restaurantId, namePersian: args.namePersian },
  });
  if (duplicate) {
    throw new OperationError('غذایی با این نام از قبل در منو هست', 'DUPLICATE');
  }

  return prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.create({
      data: {
        restaurantId: args.restaurantId,
        name: args.namePersian,
        namePersian: args.namePersian,
        type: 'MENU_ITEM',
        description: args.description || null,
        // One batch yields one portion: this recipe IS the dish, so the engine
        // must not divide its cost across a batch.
        yieldQuantity: '1',
        prepTimeMinutes: args.prepTimeMinutes,
        cookTimeMinutes: args.cookTimeMinutes,
        items: {
          create: args.lines.map((l, i) => ({
            ingredientId: l.ingredientId,
            quantity: l.quantity,
            unitId: unitOf.get(l.ingredientId)!,
            wastePercent: l.wastePercent ?? '0',
            sortOrder: i,
          })),
        },
      },
    });

    const menuItem = await tx.menuItem.create({
      data: {
        restaurantId: args.restaurantId,
        categoryId: args.categoryId,
        recipeId: recipe.id,
        name: args.namePersian,
        namePersian: args.namePersian,
        descriptionPersian: args.description || null,
        // No price yet — the manager sets it from the costing screen, where the
        // recommendation and the margin it implies are both visible.
        sellingPrice: null,
      },
    });

    return { recipeId: recipe.id, menuItemId: menuItem.id };
  }, { timeout: TX_TIMEOUT_MS });
}
