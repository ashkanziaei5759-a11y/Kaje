import Link from 'next/link';
import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, KpiCard, Badge } from '@/components/ui';
import { faDigits } from '@/lib/format';
import { formatJalaliDateTime } from '@/lib/jalali';

export const metadata = { title: 'هشدارها' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'موجودی کم',
  OUT_OF_STOCK: 'اتمام موجودی',
  INGREDIENT_PRICE_INCREASE: 'افزایش قیمت ماده اولیه',
  RECIPE_COST_INCREASE: 'افزایش قیمت تمام‌شده',
  MARGIN_BELOW_TARGET: 'حاشیه سود زیر هدف',
  HIGH_WASTE: 'ضایعات بالا',
  COST_VARIANCE: 'انحراف قیمت تمام‌شده',
  ITEM_UNPROFITABLE: 'آیتم زیان‌ده',
};

export default async function AlertsPage() {
  const user = await requireUser();

  const alerts = await prisma.alert.findMany({
    where: { restaurantId: user.restaurantId },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  });

  const unread = alerts.filter((a) => !a.isRead);
  const critical = alerts.filter((a) => a.severity === 'CRITICAL' && !a.isRead);

  return (
    <>
      <PageHeader title="هشدارها" subtitle="مواردی که نیاز به تصمیم مدیریتی دارند" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="خوانده‌نشده" value={faDigits(unread.length)} tone={unread.length ? 'warning' : 'positive'} />
        <KpiCard label="بحرانی" value={faDigits(critical.length)} tone={critical.length ? 'negative' : 'positive'} />
        <KpiCard label="کل هشدارها" value={faDigits(alerts.length)} />
        <KpiCard
          label="افزایش قیمت"
          value={faDigits(alerts.filter((a) => a.type === 'INGREDIENT_PRICE_INCREASE').length)}
        />
      </div>

      <section className="mt-6 space-y-2">
        {alerts.length === 0 ? (
          <div className="card p-10 text-center text-sm text-ink-500">هشداری ثبت نشده است.</div>
        ) : (
          alerts.map((alert) => (
            <article
              key={alert.id}
              className={`card p-4 ${alert.isRead ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink-50">{alert.title}</h2>
                    <Badge tone={alert.severity === 'CRITICAL' ? 'negative' : alert.severity === 'WARNING' ? 'warning' : 'neutral'}>
                      {alert.severity === 'CRITICAL' ? 'بحرانی' : alert.severity === 'WARNING' ? 'هشدار' : 'اطلاع'}
                    </Badge>
                    <Badge tone="neutral">{TYPE_LABELS[alert.type] ?? alert.type}</Badge>
                  </div>
                  <p className="mt-1.5 text-2xs leading-6 text-ink-400">{alert.message}</p>
                  {alert.entityType === 'MenuItem' && alert.entityId && (
                    <Link
                      href={`/menu-items/${alert.entityId}`}
                      className="mt-2 inline-block text-2xs text-saffron-400 hover:underline"
                    >
                      مشاهده آیتم ←
                    </Link>
                  )}
                </div>
                <time className="shrink-0 text-2xs text-ink-600">
                  {formatJalaliDateTime(alert.createdAt)}
                </time>
              </div>
            </article>
          ))
        )}
      </section>
    </>
  );
}
