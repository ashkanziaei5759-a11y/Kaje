import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit, diff } from '@/server/services/audit';
import { captureCostSnapshot } from '@/server/services/costing';

const schema = z.object({
  sellingPrice: z.coerce.number().min(0),
  priceIsOverridden: z.boolean(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser(PERMISSIONS.MENU_PRICE_WRITE);
    const { id } = await context.params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'قیمت وارد شده معتبر نیست' }, { status: 400 });
    }

    const existing = await prisma.menuItem.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'آیتم یافت نشد' }, { status: 404 });
    }

    const updated = await prisma.menuItem.update({
      where: { id },
      data: {
        sellingPrice: String(parsed.data.sellingPrice),
        priceIsOverridden: parsed.data.priceIsOverridden,
      },
    });

    // A price change is exactly the kind of decision the audit log exists for.
    const changes = diff(
      { sellingPrice: existing.sellingPrice?.toString(), priceIsOverridden: existing.priceIsOverridden },
      { sellingPrice: updated.sellingPrice?.toString(), priceIsOverridden: updated.priceIsOverridden },
    );
    if (changes) {
      await writeAudit(null, {
        restaurantId: user.restaurantId, userId: user.userId,
        entityType: 'MenuItem', entityId: id, action: 'PRICE_CHANGE',
        before: changes.before, after: changes.after,
      });
      // Freeze the cost at the new price so the profitability history is
      // explicable later.
      await captureCostSnapshot(user.restaurantId, id, 'PRICE_CHANGE');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update menu item price:', error);
    return NextResponse.json({ error: 'خطای غیرمنتظره در ذخیره قیمت' }, { status: 500 });
  }
}
