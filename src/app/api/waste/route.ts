import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { recordWaste } from '@/server/services/operations';
import { apiError, parseBody, decimalString } from '@/lib/api-helpers';

const schema = z.object({
  ingredientId: z.string().min(1, 'ماده اولیه را انتخاب کنید'),
  quantity: decimalString,
  reason: z.enum([
    'SPOILAGE', 'EXPIRED', 'BURNED', 'PREPARATION',
    'OVERPRODUCTION', 'DAMAGED', 'UNKNOWN', 'OTHER',
  ]),
  notes: z.string().max(1000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.WASTE_WRITE);
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const waste = await recordWaste({
      restaurantId: user.restaurantId,
      userId: user.userId,
      ...parsed.data,
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: 'waste.record',
      entityType: 'Waste',
      entityId: waste.id,
      after: { quantity: waste.quantity.toString(), totalCost: waste.totalCost.toString() },
    });

    return NextResponse.json({
      id: waste.id,
      ingredient: waste.ingredient.namePersian,
      totalCost: waste.totalCost.toString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
