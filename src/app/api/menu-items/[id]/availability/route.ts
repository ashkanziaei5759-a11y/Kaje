import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';

const schema = z.object({
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE', 'HIDDEN']),
  /** Clearing the manual flag hands the item back to automatic stock control. */
  releaseManualOverride: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(PERMISSIONS.MENU_WRITE);
    const { id } = await context.params;

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'وضعیت نامعتبر است' }, { status: 400 });
    }

    const existing = await prisma.menuItem.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!existing) return NextResponse.json({ error: 'آیتم یافت نشد' }, { status: 404 });

    await prisma.menuItem.update({
      where: { id },
      data: {
        availability: parsed.data.availability,
        // Stamping this is what makes a human decision outrank the automatic
        // sold-out logic; clearing it returns control to inventory.
        availabilityManualOverrideAt: parsed.data.releaseManualOverride ? null : new Date(),
      },
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId, userId: user.userId,
      entityType: 'MenuItem', entityId: id, action: 'AVAILABILITY_CHANGE',
      before: { availability: existing.availability },
      after: { availability: parsed.data.availability },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to update availability:', error);
    return NextResponse.json({ error: 'تغییر وضعیت انجام نشد' }, { status: 500 });
  }
}
