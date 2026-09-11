import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { d } from '@/lib/money';

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, 'عدد معتبر نیست');

const schema = z.object({
  namePersian: z.string().min(1, 'نام لازم است').max(120),
  name: z.string().max(120).optional(),
  category: z.enum([
    'MEAT', 'POULTRY', 'SEAFOOD', 'DAIRY', 'VEGETABLE', 'FRUIT', 'GRAIN',
    'SPICE', 'OIL', 'BEVERAGE', 'PACKAGING', 'CLEANING', 'OTHER',
  ]).default('OTHER'),
  purchaseUnitId: z.string().min(1),
  recipeUnitId: z.string().min(1),
  conversionFactor: decimalString,
  lastPurchasePrice: decimalString,
  yieldPercent: decimalString.default('1'),
  minimumStock: decimalString.default('0'),
  reorderLevel: decimalString.default('0'),
  defaultSupplierId: z.string().nullable().optional(),
  isPackaging: z.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.INGREDIENT_WRITE);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'اطلاعات وارد شده کامل یا معتبر نیست', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const yieldPercent = d(body.yieldPercent);
    if (yieldPercent.lessThanOrEqualTo(0) || yieldPercent.greaterThan(1)) {
      return NextResponse.json(
        { error: 'بازده باید بین ۰ و ۱ باشد (مثلاً ۰٫۸ برای ۸۰٪)', field: 'yieldPercent' },
        { status: 400 },
      );
    }
    if (d(body.conversionFactor).lessThanOrEqualTo(0)) {
      return NextResponse.json(
        { error: 'ضریب تبدیل باید بزرگ‌تر از صفر باشد', field: 'conversionFactor' },
        { status: 400 },
      );
    }

    // Units and the supplier must belong to this restaurant.
    const [units, supplier] = await Promise.all([
      prisma.unitDefinition.count({
        where: {
          id: { in: [body.purchaseUnitId, body.recipeUnitId] },
          restaurantId: user.restaurantId,
        },
      }),
      body.defaultSupplierId
        ? prisma.supplier.count({
            where: { id: body.defaultSupplierId, restaurantId: user.restaurantId },
          })
        : Promise.resolve(1),
    ]);
    const distinctUnits = new Set([body.purchaseUnitId, body.recipeUnitId]).size;
    if (units !== distinctUnits || supplier === 0) {
      return NextResponse.json(
        { error: 'واحد یا تأمین‌کننده انتخاب‌شده معتبر نیست' },
        { status: 400 },
      );
    }

    const duplicate = await prisma.ingredient.findFirst({
      where: { restaurantId: user.restaurantId, name: body.name || body.namePersian },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: 'ماده اولیه‌ای با این نام از قبل ثبت شده است', field: 'namePersian' },
        { status: 409 },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          restaurantId: user.restaurantId,
          name: body.name || body.namePersian,
          namePersian: body.namePersian,
          category: body.category,
          purchaseUnitId: body.purchaseUnitId,
          recipeUnitId: body.recipeUnitId,
          conversionFactor: body.conversionFactor,
          yieldPercent: body.yieldPercent,
          // The opening price counts as both the last and the average, since
          // there is no delivery history to weight it against yet.
          lastPurchasePrice: body.lastPurchasePrice,
          averagePrice: body.lastPurchasePrice,
          lastPurchaseDate: new Date(),
          minimumStock: body.minimumStock,
          reorderLevel: body.reorderLevel,
          isPackaging: body.isPackaging || body.category === 'PACKAGING',
          defaultSupplierId: body.defaultSupplierId || null,
          notes: body.notes ?? null,
        },
      });

      // Seed the price ledger so the chart has a starting point rather than
      // beginning at the first delivery and appearing to come from nowhere.
      await tx.ingredientPriceHistory.create({
        data: {
          ingredientId: ingredient.id,
          price: body.lastPurchasePrice,
          source: 'MANUAL',
          effectiveAt: new Date(),
        },
      });

      return ingredient;
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId, userId: user.userId,
      entityType: 'Ingredient', entityId: created.id, action: 'CREATE',
      after: { name: created.namePersian, price: created.lastPurchasePrice.toString() },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to create ingredient:', error);
    return NextResponse.json({ error: 'ثبت ماده اولیه انجام نشد' }, { status: 500 });
  }
}
