import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiUser, AuthError } from '@/lib/auth/guard';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { storeMenuImage, deleteMenuImage, ImageError, MAX_UPLOAD_BYTES } from '@/server/services/images';
import { writeAudit } from '@/server/services/audit';

export const runtime = 'nodejs';

/** Uploads or replaces a menu item's photo. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(PERMISSIONS.MENU_WRITE);
    const { id } = await context.params;

    const item = await prisma.menuItem.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!item) return NextResponse.json({ error: 'آیتم یافت نشد' }, { status: 404 });

    const form = await request.formData().catch(() => null);
    const file = form?.get('image');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'عکسی انتخاب نشده است' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `حجم عکس نباید از ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} مگابایت بیشتر باشد` },
        { status: 413 },
      );
    }

    const stored = await storeMenuImage(file, item.name);
    const previous = item.imageUrl;

    await prisma.menuItem.update({ where: { id }, data: { imageUrl: stored.url } });

    // Remove the old rendition only after the new one is committed, so a
    // failure mid-way leaves the item with a working picture rather than none.
    if (previous && previous !== stored.url) await deleteMenuImage(previous);

    await writeAudit(null, {
      restaurantId: user.restaurantId, userId: user.userId,
      entityType: 'MenuItem', entityId: id, action: 'IMAGE_UPLOAD',
      before: { imageUrl: previous },
      after: { imageUrl: stored.url },
    });

    return NextResponse.json({ ok: true, ...stored });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ImageError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    console.error('Menu image upload failed:', error);
    return NextResponse.json({ error: 'بارگذاری عکس انجام نشد' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(PERMISSIONS.MENU_WRITE);
    const { id } = await context.params;

    const item = await prisma.menuItem.findFirst({
      where: { id, restaurantId: user.restaurantId },
    });
    if (!item) return NextResponse.json({ error: 'آیتم یافت نشد' }, { status: 404 });

    await prisma.menuItem.update({ where: { id }, data: { imageUrl: null } });
    await deleteMenuImage(item.imageUrl);

    await writeAudit(null, {
      restaurantId: user.restaurantId, userId: user.userId,
      entityType: 'MenuItem', entityId: id, action: 'IMAGE_REMOVE',
      before: { imageUrl: item.imageUrl },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Menu image delete failed:', error);
    return NextResponse.json({ error: 'حذف عکس انجام نشد' }, { status: 500 });
  }
}
