import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { upsertSupplier } from '@/server/services/operations';
import { apiError, parseBody } from '@/lib/api-helpers';

const schema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().min(1, 'نام لازم است').max(160),
  namePersian: z.string().max(160).nullable().optional(),
  contactPerson: z.string().max(160).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email('ایمیل معتبر نیست').max(160).nullable().optional().or(z.literal('')),
  address: z.string().max(500).nullable().optional(),
  paymentTerms: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.SUPPLIER_WRITE);
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const supplier = await upsertSupplier({
      restaurantId: user.restaurantId,
      ...body,
      email: body.email || null,
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: body.id ? 'supplier.update' : 'supplier.create',
      entityType: 'Supplier',
      entityId: supplier.id,
      after: { name: supplier.name, isActive: supplier.isActive },
    });

    return NextResponse.json({ id: supplier.id, name: supplier.name });
  } catch (error) {
    return apiError(error);
  }
}
