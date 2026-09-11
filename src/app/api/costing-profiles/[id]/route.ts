import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit, diff } from '@/server/services/audit';
import { d } from '@/lib/money';

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'عدد معتبر نیست');
/** A fraction: 0.30 means 30%. */
const fraction = decimalString;

const schema = z.object({
  laborMethod: z.enum(['PER_MINUTE', 'PERCENT_OF_REVENUE', 'PER_UNIT', 'NONE']).optional(),
  laborCostPerMinute: decimalString.optional(),
  laborPercentOfRevenue: fraction.optional(),
  monthlyLaborCost: decimalString.optional(),

  overheadMethod: z.enum([
    'PER_UNIT', 'PERCENT_OF_REVENUE', 'PERCENT_OF_FOOD_COST', 'PER_LABOR_MINUTE', 'NONE',
  ]).optional(),
  monthlyOverheadCost: decimalString.optional(),
  expectedMonthlyUnits: z.number().int().min(1).max(10_000_000).optional(),
  overheadPercentOfRevenue: fraction.optional(),
  overheadPercentOfFoodCost: fraction.optional(),
  overheadPerLaborMinute: decimalString.optional(),

  pricingStrategy: z.enum([
    'TARGET_GROSS_MARGIN', 'TARGET_FOOD_COST', 'COST_PLUS_MARKUP', 'FIXED_PROFIT',
  ]).optional(),
  targetGrossMargin: fraction.optional(),
  targetFoodCostPct: fraction.optional(),
  targetNetMargin: fraction.optional(),
  markupMultiplier: decimalString.optional(),
  fixedDesiredProfit: decimalString.optional(),
  minimumMargin: fraction.optional(),

  roundingRule: z.enum([
    'NONE', 'NEAREST_1000', 'NEAREST_5000', 'NEAREST_10000', 'CHARM_9',
  ]).optional(),
  taxRate: fraction.optional(),
  taxInclusive: z.boolean().optional(),
  wasteBufferPct: fraction.optional(),
});

/** Ranges the cost engine assumes; violating them makes it throw mid-render. */
const BOUNDS: Array<{ key: keyof z.infer<typeof schema>; max: number; exclusive: boolean; label: string }> = [
  { key: 'targetGrossMargin', max: 1, exclusive: true, label: 'هدف حاشیه سود' },
  { key: 'targetFoodCostPct', max: 1, exclusive: false, label: 'هدف درصد مواد اولیه' },
  { key: 'targetNetMargin', max: 1, exclusive: true, label: 'هدف سود خالص' },
  { key: 'minimumMargin', max: 1, exclusive: true, label: 'حداقل حاشیه سود' },
  { key: 'wasteBufferPct', max: 1, exclusive: true, label: 'ضریب ضایعات' },
  { key: 'laborPercentOfRevenue', max: 1, exclusive: true, label: 'درصد نیروی کار' },
  { key: 'overheadPercentOfRevenue', max: 1, exclusive: true, label: 'درصد سربار از فروش' },
];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(PERMISSIONS.COST_CONFIGURE);
    const { id } = await context.params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'مقادیر معتبر نیستند', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;

    for (const bound of BOUNDS) {
      const raw = body[bound.key];
      if (raw === undefined) continue;
      const value = d(String(raw));
      const tooHigh = bound.exclusive
        ? value.greaterThanOrEqualTo(bound.max)
        : value.greaterThan(bound.max);
      if (value.lessThan(0) || tooHigh) {
        return NextResponse.json(
          {
            error:
              `${bound.label} باید کسری بین ۰ تا ${bound.exclusive ? 'کمتر از ۱' : '۱'} باشد ` +
              `(مثلاً ۰٫۳ برای ۳۰٪)`,
            field: bound.key,
          },
          { status: 400 },
        );
      }
    }

    // A target margin of 1 would make the recommended price divide by zero.
    if (body.pricingStrategy === 'TARGET_FOOD_COST' && body.targetFoodCostPct !== undefined) {
      if (d(body.targetFoodCostPct).isZero()) {
        return NextResponse.json(
          { error: 'هدف درصد مواد اولیه نمی‌تواند صفر باشد', field: 'targetFoodCostPct' },
          { status: 400 },
        );
      }
    }

    const existing = await prisma.costingProfile.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) return NextResponse.json({ error: 'پروفایل یافت نشد' }, { status: 404 });

    const updated = await prisma.costingProfile.update({ where: { id }, data: body });

    const snapshot = (row: typeof existing) => ({
      laborMethod: row.laborMethod,
      laborCostPerMinute: row.laborCostPerMinute.toString(),
      overheadMethod: row.overheadMethod,
      monthlyOverheadCost: row.monthlyOverheadCost.toString(),
      expectedMonthlyUnits: String(row.expectedMonthlyUnits),
      pricingStrategy: row.pricingStrategy,
      targetGrossMargin: row.targetGrossMargin.toString(),
      minimumMargin: row.minimumMargin.toString(),
      roundingRule: row.roundingRule,
      taxRate: row.taxRate.toString(),
    });

    const changes = diff(snapshot(existing), snapshot(updated));
    if (changes) {
      // Changing a profile silently re-prices every item that uses it, so this
      // is one of the most consequential edits in the system.
      await writeAudit(null, {
        restaurantId: user.restaurantId, userId: user.userId,
        entityType: 'CostingProfile', entityId: id, action: 'UPDATE',
        before: changes.before, after: changes.after,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update costing profile:', error);
    return NextResponse.json({ error: 'ذخیره تنظیمات انجام نشد' }, { status: 500 });
  }
}
