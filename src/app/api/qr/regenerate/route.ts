import { NextResponse } from 'next/server';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { regenerateQrCode } from '@/server/services/qr';
import { writeAudit } from '@/server/services/audit';

export async function POST() {
  try {
    const user = await requireApiUser(PERMISSIONS.MENU_WRITE);
    const qr = await regenerateQrCode(user.restaurantId);
    await writeAudit(null, {
      restaurantId: user.restaurantId, userId: user.userId,
      entityType: 'QRCode', entityId: qr.id, action: 'REGENERATE',
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Failed to regenerate QR code:', error);
    return NextResponse.json({ error: 'ساخت کد جدید انجام نشد' }, { status: 500 });
  }
}
