import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit, diff } from '@/server/services/audit';
import { d } from '@/lib/money';

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'عدد معتبر نیست');

const schema = z.object({
  /** Price of ONE purchase unit. Writing this also appends price history. */
  lastPurchasePrice: decimalString.optional(),
  /** Usable fraction after trimming, in (0,1]. */
  yieldPercent: decimalString.optional(),
  /** Recipe units per one purchase unit. */
  conversionFactor: decimalString.optional(),
  minimumStock: decimalString.optional(),
  reorderLevel: decimalString.optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'چیزی برای تغییر ارسال نشده' });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(PERMISSIONS.INGREDIENT_WRITE);
    const { id } = await context.params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'مقادیر معتبر نیستند', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // The database has CHECK constraints for these, but a constraint violation
    // surfaces as an opaque 500. Validating here returns a message the form can
    // put next to the offending field.
    if (body.yieldPercent !== undefined) {
      const y = d(body.yieldPercent);
      if (y.lessThanOrEqualTo(0) || y.greaterThan(1)) {
        return NextResponse.json(
          { error: 'بازده باید بین ۰ و ۱ باشد (مثلاً ۰٫۸ برای ۸۰٪)', field: 'yieldPercent' },
          { status: 400 },
        );
      }
    }
    if (body.conversionFactor !== undefined && d(body.conversionFactor).lessThanOrEqualTo(0)) {
      return NextResponse.json(
        { error: 'ضریب تبدیل باید بزرگ‌تر از صفر باشد', field: 'conversionFactor' },
        { status: 400 },
      );
    }

    const existing = await prisma.ingredient.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) return NextResponse.json({ error: 'ماده اولیه یافت نشد' }, { status: 404 });

    const priceChanged =
      body.lastPurchasePrice !== undefined &&
      !d(body.lastPurchasePrice).equals(d(existing.lastPurchasePrice));

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.ingredient.update({
        where: { id },
        data: {
          ...(body.lastPurchasePrice !== undefined && {
            lastPurchasePrice: body.lastPurchasePrice,
            // A manual price correction replaces the weighted average too;
            // leaving the average stale would keep costing dishes at the old
            // figure while the screen shows the new one.
            averagePrice: body.lastPurchasePrice,
          }),
          ...(body.yieldPercent !== undefined && { yieldPercent: body.yieldPercent }),
          ...(body.conversionFactor !== undefined && { conversionFactor: body.conversionFactor }),
          ...(body.minimumStock !== undefined && { minimumStock: body.minimumStock }),
          ...(body.reorderLevel !== undefined && { reorderLevel: body.reorderLevel }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      // Every price movement lands in the ledger, whoever caused it — a manual
      // correction has to show up on the price chart alongside deliveries.
      if (priceChanged) {
        const previous = d(existing.lastPurchasePrice);
        const next = d(body.lastPurchasePrice!);
        await tx.ingredientPriceHistory.create({
          data: {
            ingredientId: id,
            price: next.toFixed(4),
            previousPrice: previous.isZero() ? null : previous.toFixed(4),
            changePercent: previous.isZero()
              ? null
              : next.minus(previous).dividedBy(previous).toDecimalPlaces(6).toFixed(),
            source: 'MANUAL',
            effectiveAt: new Date(),
          },
        });
      }
      return row;
    });

    const changes = diff(
      {
        lastPurchasePrice: existing.lastPurchasePrice.toString(),
        yieldPercent: existing.yieldPercent.toString(),
        conversionFactor: existing.conversionFactor.toString(),
        minimumStock: existing.minimumStock.toString(),
        reorderLevel: existing.reorderLevel.toString(),
        isActive: String(existing.isActive),
      },
      {
        lastPurchasePrice: updated.lastPurchasePrice.toString(),
        yieldPercent: updated.yieldPercent.toString(),
        conversionFactor: updated.conversionFactor.toString(),
        minimumStock: updated.minimumStock.toString(),
        reorderLevel: updated.reorderLevel.toString(),
        isActive: String(updated.isActive),
      },
    );
    if (changes) {
      await writeAudit(null, {
        restaurantId: user.restaurantId, userId: user.userId,
        entityType: 'Ingredient', entityId: id,
        action: priceChanged ? 'PRICE_CHANGE' : 'UPDATE',
        before: changes.before, after: changes.after,
      });
    }

    return NextResponse.json({ ok: true, priceChanged });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update ingredient:', error);
    return NextResponse.json({ error: 'ذخیره تغییرات انجام نشد' }, { status: 500 });
  }
}
