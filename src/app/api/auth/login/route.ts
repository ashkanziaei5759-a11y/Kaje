import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  createSessionToken, setSessionCookie, verifyPassword,
} from '@/lib/auth/session';
import { writeAudit } from '@/server/services/audit';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'ایمیل یا رمز عبور نامعتبر است' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { role: true },
  });

  // Same message and comparable timing for "no such user" and "wrong password",
  // so the endpoint cannot be used to enumerate accounts.
  const passwordOk = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await verifyPassword(parsed.data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

  if (!user || !passwordOk || !user.isActive) {
    return NextResponse.json({ error: 'ایمیل یا رمز عبور اشتباه است' }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    restaurantId: user.restaurantId,
    branchId: user.branchId,
    role: user.role.name,
    permissions: user.role.permissions,
  });
  await setSessionCookie(token);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit(null, {
    restaurantId: user.restaurantId, userId: user.id,
    entityType: 'User', entityId: user.id, action: 'LOGIN',
    ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
