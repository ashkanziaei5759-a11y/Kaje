import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { createExpense } from '@/server/services/operations';
import { apiError, parseBody, decimalString, dateString } from '@/lib/api-helpers';

const schema = z.object({
  categoryId: z.string().min(1, 'دستهٔ هزینه را انتخاب کنید'),
  amount: decimalString,
  type: z.enum(['FIXED', 'VARIABLE', 'ONE_TIME', 'RECURRING']).default('VARIABLE'),
  expenseDate: dateString,
  description: z.string().max(1000).nullable().optional(),
  payee: z.string().max(200).nullable().optional(),
  supplierId: z.string().nullable().optional(),
  isRecurring: z.boolean().default(false),
  recurrenceInterval: z.string().max(40).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.EXPENSE_WRITE);
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const expense = await createExpense({
      restaurantId: user.restaurantId,
      userId: user.userId,
      ...body,
      expenseDate: new Date(`${body.expenseDate}T12:00:00`),
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: 'expense.create',
      entityType: 'Expense',
      entityId: expense.id,
      after: { amount: expense.amount.toString(), category: expense.category.namePersian },
    });

    return NextResponse.json({
      id: expense.id,
      amount: expense.amount.toString(),
      category: expense.category.namePersian,
    });
  } catch (error) {
    return apiError(error);
  }
}
