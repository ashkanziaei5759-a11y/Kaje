import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { getOrCreateQrCode, renderQr } from '@/server/services/qr';
import { getPublicMenu } from '@/server/services/menu';
import { PageHeader, Badge } from '@/components/ui';
import { QrPanel } from '@/components/QrPanel';
import { AvailabilityToggle } from '@/components/AvailabilityToggle';
import { ImageUploader } from '@/components/menu/ImageUploader';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { formatCurrency } from '@/lib/format';

export const metadata = { title: 'منوی دیجیتال و QR' };
export const dynamic = 'force-dynamic';

export default async function DigitalMenuPage() {
  const user = await requireUser();

  const [restaurant, qr, items] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    getOrCreateQrCode(user.restaurantId),
    prisma.menuItem.findMany({
      where: { restaurantId: user.restaurantId, isActive: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    }),
  ]);

  const [rendered, publicMenu] = await Promise.all([
    renderQr(qr.token, qr.targetPath),
    getPublicMenu(restaurant?.slug ?? 'kajeh'),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';
  const canEditMenu = hasPermission(user.permissions, PERMISSIONS.MENU_WRITE);
  const visibleCount = publicMenu?.categories.reduce((n, c) => n + c.items.length, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="منوی دیجیتال و QR"
        subtitle="کدی که روی میز چاپ می‌شود، عکس غذاها و منویی که مشتری می‌بیند"
        action={<Badge tone="accent">{visibleCount.toLocaleString('fa-IR')} آیتم روی منو</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <QrPanel
          svg={rendered.svg}
          png={rendered.png}
          url={rendered.url}
          label={qr.label}
          scanCount={qr.scanCount}
          restaurantName={restaurant?.namePersian ?? 'کاژه'}
        />

        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">وضعیت نمایش آیتم‌ها</h2>
          <p className="mb-3 text-2xs leading-6 text-ink-600">
            «موجود» روی منو نمایش داده و قابل سفارش است. «ناموجود» نمایش داده می‌شود اما
            تمام‌شده علامت می‌خورد. «مخفی» اصلاً روی منو نمی‌آید.
            تغییر دستیِ وضعیت بر تشخیص خودکار از روی موجودی انبار اولویت دارد.
          </p>

          <div className="card divide-y divide-ink-100">
            {items.map((item) => (
              <div key={item.id} className="space-y-3 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-800">{item.namePersian}</p>
                    <p className="text-2xs text-ink-600">
                      {item.category.namePersian}
                      {' — '}
                      <span className="tabular">
                        {formatCurrency(item.sellingPrice?.toString() ?? '0', { symbol })}
                      </span>
                    </p>
                  </div>
                  {item.availabilityManualOverrideAt && (
                    <Badge tone="accent">دستی</Badge>
                  )}
                  <AvailabilityToggle
                    menuItemId={item.id}
                    availability={item.availability}
                    autoSoldOut={item.autoSoldOut}
                  />
                </div>

                <ImageUploader
                  menuItemId={item.id}
                  itemName={item.namePersian}
                  currentImageUrl={item.imageUrl}
                  canEdit={canEditMenu}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
