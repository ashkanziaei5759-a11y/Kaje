import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { recordStockCount } from '@/server/services/operations';
import { apiError, parseBody, decimalString } from '@/lib/api-helpers';

const schema = z.object({
  notes: z.string().max(1000).nullable().optional(),
  lines: z
    .array(z.object({ ingredientId: z.string().min(1), countedQuantity: decimalString }))
    .min(1, 'حداقل یک قلم باید شمارش شود'),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.INVENTORY_COUNT);
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const result = await recordStockCount({
      restaurantId: user.restaurantId,
      userId: user.userId,
      ...parsed.data,
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: 'inventory.count',
      entityType: 'InventoryCount',
      entityId: result.countId,
      after: { linesCounted: result.linesCounted, adjusted: result.adjusted },
    });

    return NextResponse.json({
      id: result.countId,
      linesCounted: result.linesCounted,
      adjusted: result.adjusted,
      netQuantity: result.netQuantity.toString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
