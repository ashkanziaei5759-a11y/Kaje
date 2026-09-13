import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError } from '@/lib/auth/guard';
import { OperationError } from '@/server/services/operations';

/** A positive decimal written as digits, e.g. "1200000" or "2.5". */
export const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'عدد معتبر نیست');

/** A date the user picked, as YYYY-MM-DD, read in the server's own day. */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'تاریخ معتبر نیست');

/**
 * Turns the errors these routes actually throw into the response the form
 * expects. Without it every route repeats the same four catch branches, and
 * they drift: one returns 500 for a validation failure the next returns 400 for.
 */
export function apiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof OperationError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  console.error('[api]', error);
  return NextResponse.json(
    { error: 'خطای پیش‌بینی‌نشده در سرور. دوباره تلاش کنید.' },
    { status: 500 },
  );
}

/** Parses a request body, returning the 400 response instead when it is invalid. */
export async function parseBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'اطلاعات وارد شده کامل یا معتبر نیست',
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
