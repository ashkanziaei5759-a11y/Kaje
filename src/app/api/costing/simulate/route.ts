import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { simulateMenuItemCost } from '@/server/services/simulate';
import { CostEngineError } from '@/lib/engine/cost-engine';

/** Values arrive as strings so decimals survive JSON without float rounding. */
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'عدد معتبر نیست');

const schema = z.object({
  menuItemId: z.string().min(1),
  ingredientPrices: z.record(decimalString).optional(),
  ingredientYields: z.record(decimalString).optional(),
  lineQuantities: z.record(decimalString).optional(),
  removedLineIds: z.array(z.string()).optional(),
  profile: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  sellingPrice: decimalString.nullable().optional(),
  laborMinutes: z.number().int().min(0).max(600).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(PERMISSIONS.COST_VIEW);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'مقادیر ارسالی معتبر نیستند', issues: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { menuItemId, ...draft } = parsed.data;
    const result = await simulateMenuItemCost(user.restaurantId, menuItemId, draft);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // A cycle or an impossible yield is the user's edit being invalid, not a
    // server fault — report it so the form can show what went wrong.
    if (error instanceof CostEngineError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    console.error('Cost simulation failed:', error);
    return NextResponse.json({ error: 'محاسبه انجام نشد' }, { status: 500 });
  }
}
