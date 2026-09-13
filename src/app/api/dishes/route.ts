import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { createDish } from '@/server/services/operations';
import { costOneMenuItem } from '@/server/services/costing';
import { apiError, parseBody, decimalString } from '@/lib/api-helpers';

const schema = z.object({
  namePersian: z.string().min(1, 'نام غذا لازم است').max(160),
  categoryId: z.string().min(1, 'دستهٔ منو را انتخاب کنید'),
  description: z.string().max(1000).nullable().optional(),
  prepTimeMinutes: z.number().int().min(0).max(600).default(0),
  cookTimeMinutes: z.number().int().min(0).max(600).default(0),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: decimalString,
        wastePercent: decimalString.default('0'),
      }),
    )
    .min(1, 'حداقل یک ماده اولیه لازم است'),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser([PERMISSIONS.MENU_WRITE, PERMISSIONS.RECIPE_WRITE]);

    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const created = await createDish({ restaurantId: user.restaurantId, ...parsed.data });

    // Cost it immediately, so the response can tell the manager what the dish
    // costs and what it should sell for — the answer they created it to get.
    const cost = await costOneMenuItem(user.restaurantId, created.menuItemId);

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: 'dish.create',
      entityType: 'MenuItem',
      entityId: created.menuItemId,
      after: {
        namePersian: parsed.data.namePersian,
        lines: parsed.data.lines.length,
        totalCost: cost.totalCost.toString(),
      },
    });

    return NextResponse.json({
      menuItemId: created.menuItemId,
      recipeId: created.recipeId,
      totalCost: cost.totalCost.toString(),
      recommendedPrice: cost.recommendedPrice.toString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
