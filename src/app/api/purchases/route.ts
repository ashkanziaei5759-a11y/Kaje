import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { createPurchase } from '@/server/services/operations';
import { approvePurchase } from '@/server/services/purchasing';
import { apiError, parseBody, decimalString, dateString } from '@/lib/api-helpers';

const schema = z.object({
  supplierId: z.string().min(1, 'تأمین‌کننده را انتخاب کنید'),
  purchaseDate: dateString,
  invoiceNumber: z.string().max(60).nullable().optional(),
  discountAmount: decimalString.default('0'),
  taxAmount: decimalString.default('0'),
  notes: z.string().max(2000).nullable().optional(),
  approve: z.boolean().default(true),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().min(1),
        quantity: decimalString,
        unitPrice: decimalString,
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1, 'حداقل یک قلم لازم است'),
});

export async function POST(request: Request) {
  try {
    // Recording an invoice and accepting its effect on stock and prices are
    // separate rights, so approving in one step needs both.
    const user = await requireApiUser(PERMISSIONS.PURCHASE_WRITE);

    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    if (body.approve) await requireApiUser(PERMISSIONS.PURCHASE_APPROVE);

    const purchase = await createPurchase({
      restaurantId: user.restaurantId,
      userId: user.userId,
      supplierId: body.supplierId,
      purchaseDate: new Date(`${body.purchaseDate}T12:00:00`),
      invoiceNumber: body.invoiceNumber,
      discountAmount: body.discountAmount,
      taxAmount: body.taxAmount,
      notes: body.notes,
      lines: body.lines,
      approve: body.approve,
    });

    let applied: { linesApplied: number; alertsRaised: number } | null = null;
    if (body.approve) {
      applied = await approvePurchase({
        purchaseId: purchase.id,
        restaurantId: user.restaurantId,
        userId: user.userId,
      });
    }

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: body.approve ? 'purchase.approve' : 'purchase.create',
      entityType: 'Purchase',
      entityId: purchase.id,
      after: {
        supplierId: body.supplierId,
        totalAmount: purchase.totalAmount.toString(),
        lines: body.lines.length,
      },
    });

    return NextResponse.json({
      id: purchase.id,
      totalAmount: purchase.totalAmount.toString(),
      approved: body.approve,
      linesApplied: applied?.linesApplied ?? 0,
      alertsRaised: applied?.alertsRaised ?? 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
