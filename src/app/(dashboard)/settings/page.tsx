import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, Badge, Table } from '@/components/ui';
import { formatJalaliDateTime } from '@/lib/jalali';
import { faDigits } from '@/lib/format';

export const metadata = { title: 'تنظیمات' };
export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'مالک', MANAGER: 'مدیر', ACCOUNTANT: 'حسابدار',
  KITCHEN: 'آشپزخانه', WAITER: 'سالن‌دار', INVENTORY_MANAGER: 'انباردار',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'ایجاد', UPDATE: 'ویرایش', DELETE: 'حذف', APPROVE: 'تأیید',
  LOGIN: 'ورود', PRICE_CHANGE: 'تغییر قیمت', CONFIRM: 'تأیید سفارش',
  CANCELLED: 'لغو', REFUNDED: 'استرداد', VERSION: 'نسخه جدید',
  AVAILABILITY_CHANGE: 'تغییر وضعیت نمایش', REGENERATE: 'ساخت مجدد',
};

export default async function SettingsPage() {
  const user = await requireUser();

  const [restaurant, branches, users, roles, units, settings, auditLogs] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.branch.findMany({
      where: { restaurantId: user.restaurantId },
      include: { warehouses: true },
    }),
    prisma.user.findMany({
      where: { restaurantId: user.restaurantId },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.role.findMany(),
    prisma.unitDefinition.findMany({ where: { restaurantId: user.restaurantId } }),
    prisma.setting.findMany({ where: { restaurantId: user.restaurantId } }),
    prisma.auditLog.findMany({
      where: { restaurantId: user.restaurantId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
  ]);

  return (
    <>
      <PageHeader title="تنظیمات" subtitle="مشخصات مجموعه، شعب، کاربران، واحدها و دفتر رخدادها" />

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">مشخصات مجموعه</h2>
          <dl className="mt-3 space-y-1.5 text-2xs">
            <Kv label="نام" value={restaurant?.namePersian ?? ''} />
            <Kv label="نام لاتین" value={restaurant?.name ?? ''} />
            <Kv label="واحد پول" value={`${restaurant?.currencySymbol} (${restaurant?.currencyCode})`} />
            <Kv label="تقویم" value={restaurant?.calendar === 'jalali' ? 'شمسی (جلالی)' : 'میلادی'} />
            <Kv label="منطقه زمانی" value={restaurant?.timezone ?? ''} />
            <Kv label="زبان" value={restaurant?.locale ?? ''} />
            <Kv label="تلفن" value={restaurant?.phone ?? '—'} />
            <Kv label="نشانی" value={restaurant?.address ?? '—'} />
          </dl>
          <p className="mt-3 text-2xs leading-6 text-ink-600">
            واحد پول در کد ثابت نشده است. تغییر آن، نمایش تمام مبالغ سامانه را عوض می‌کند
            بدون اینکه داده‌ای بازنویسی شود.
          </p>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">شعب و انبارها</h2>
          <ul className="mt-3 space-y-2">
            {branches.map((branch) => (
              <li key={branch.id} className="rounded-lg border border-ink-200 bg-ink-100 p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-2xs font-medium text-ink-800">{branch.namePersian}</p>
                  <Badge tone={branch.isActive ? 'positive' : 'neutral'}>{branch.code}</Badge>
                </div>
                <p className="mt-1 text-2xs text-ink-600">
                  انبارها: {branch.warehouses.map((w) => w.namePersian).join('، ') || '—'}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs leading-6 text-ink-600">
            ساختار داده از ابتدا چندشعبه‌ای طراحی شده — افزودن شعبه دوم به تغییر ساختار
            جدول‌ها نیاز ندارد.
          </p>
        </section>
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">واحدهای اندازه‌گیری</h2>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {units.map((unit) => (
              <div key={unit.id} className="flex justify-between rounded-lg border border-ink-200 bg-ink-100 px-2.5 py-1.5 text-2xs">
                <span className="text-ink-700">{unit.labelPersian}</span>
                <span className="tabular text-ink-600" dir="ltr">
                  {unit.code} = {Number(unit.factorToBase)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink-800">تنظیمات سامانه</h2>
          <dl className="mt-3 space-y-1.5 text-2xs">
            {settings.map((setting) => (
              <div key={setting.id} className="flex justify-between gap-3">
                <dt className="text-ink-600" dir="ltr">{setting.key}</dt>
                <dd className="tabular text-ink-700" dir="ltr">{JSON.stringify(setting.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">کاربران و دسترسی‌ها</h2>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">نام</th>
              <th className="th">ایمیل</th>
              <th className="th">نقش</th>
              <th className="th">تعداد دسترسی</th>
              <th className="th">آخرین ورود</th>
              <th className="th">وضعیت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td">{u.name}</td>
                <td className="td text-ink-600" dir="ltr">{u.email}</td>
                <td className="td">
                  <Badge tone={u.role.name === 'OWNER' ? 'accent' : 'neutral'}>
                    {ROLE_LABELS[u.role.name] ?? u.role.name}
                  </Badge>
                </td>
                <td className="td tabular text-ink-600">
                  {u.role.permissions.includes('*') ? 'همه' : faDigits(u.role.permissions.length)}
                </td>
                <td className="td text-2xs text-ink-600">
                  {u.lastLoginAt ? formatJalaliDateTime(u.lastLoginAt) : '—'}
                </td>
                <td className="td">
                  <Badge tone={u.isActive ? 'positive' : 'negative'}>
                    {u.isActive ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="mt-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-800">دفتر رخدادها</h2>
        <p className="mb-3 text-2xs text-ink-600">
          چه کسی قیمتی را عوض کرد، دستور پختی را تغییر داد یا فاکتوری را تأیید کرد.
        </p>
        <Table>
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">زمان</th>
              <th className="th">کاربر</th>
              <th className="th">عملیات</th>
              <th className="th">موجودیت</th>
              <th className="th">تغییر</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="td text-2xs text-ink-600">{formatJalaliDateTime(log.createdAt)}</td>
                <td className="td text-2xs">{log.user?.name ?? 'سامانه'}</td>
                <td className="td">
                  <Badge tone={log.action === 'PRICE_CHANGE' ? 'warning' : 'neutral'}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </Badge>
                </td>
                <td className="td text-2xs text-ink-600" dir="ltr">{log.entityType}</td>
                <td className="td text-2xs text-ink-600 max-w-[20rem] truncate" dir="ltr">
                  {log.before || log.after
                    ? `${JSON.stringify(log.before ?? {})} → ${JSON.stringify(log.after ?? {})}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-600">{label}</dt>
      <dd className="truncate text-ink-700">{value}</dd>
    </div>
  );
}
