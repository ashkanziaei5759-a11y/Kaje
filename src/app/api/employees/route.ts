import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { writeAudit } from '@/server/services/audit';
import { upsertEmployee } from '@/server/services/operations';
import { apiError, parseBody, decimalString, dateString } from '@/lib/api-helpers';

const schema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().min(1, 'نام لازم است').max(160),
  role: z.string().min(1, 'سمت لازم است').max(120),
  department: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  salaryType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('MONTHLY'),
  salaryAmount: decimalString,
  monthlyHours: decimalString.default('208'),
  burdenPercent: decimalString.default('0'),
  hireDate: dateString.nullable().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.EMPLOYEE_WRITE);
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const employee = await upsertEmployee({
      restaurantId: user.restaurantId,
      ...body,
      hireDate: body.hireDate ? new Date(`${body.hireDate}T12:00:00`) : null,
    });

    await writeAudit(null, {
      restaurantId: user.restaurantId,
      userId: user.userId,
      action: body.id ? 'employee.update' : 'employee.create',
      entityType: 'Employee',
      entityId: employee.id,
      after: { name: employee.name, role: employee.role, isActive: employee.isActive },
    });

    return NextResponse.json({ id: employee.id, name: employee.name });
  } catch (error) {
    return apiError(error);
  }
}
