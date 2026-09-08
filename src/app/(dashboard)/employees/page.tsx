import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { PageHeader, KpiCard, Table, Badge } from '@/components/ui';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';

export const metadata = { title: 'کارکنان' };
export const dynamic = 'force-dynamic';

const SALARY_LABELS: Record<string, string> = {
  MONTHLY: 'ماهانه', DAILY: 'روزانه', HOURLY: 'ساعتی',
};

export default async function EmployeesPage() {
  const user = await requireUser();

  const [restaurant, employees, profile] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    prisma.employee.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: [{ isActive: 'desc' }, { department: 'asc' }],
    }),
    prisma.costingProfile.findFirst({
      where: { restaurantId: user.restaurantId, isDefault: true },
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';

  /**
   * Fully-loaded monthly cost, and the per-minute rate that follows from it.
   * Employer burden (insurance, benefits) is part of what an hour actually
   * costs, so costing at bare salary understates every dish.
   */
  function costs(employee: (typeof employees)[number]) {
    const base = Number(employee.salaryAmount);
    const burden = 1 + Number(employee.burdenPercent);
    const hours = Number(employee.monthlyHours);

    const monthly =
      employee.salaryType === 'MONTHLY' ? base * burden
        : employee.salaryType === 'DAILY' ? base * burden * 26
          : base * burden * hours;

    const perHour = hours > 0 ? monthly / hours : 0;
    return { monthly, perHour, perMinute: perHour / 60 };
  }

  const active = employees.filter((e) => e.isActive);
  const totalMonthly = active.reduce((sum, e) => sum + costs(e).monthly, 0);
  const kitchen = active.filter((e) => e.department === 'آشپزخانه');
  const kitchenMinutes = kitchen.reduce((sum, e) => sum + costs(e).perMinute, 0);

  return (
    <>
      <PageHeader
        title="کارکنان و هزینه نیروی کار"
        subtitle="نرخ هر دقیقه کار، پایه محاسبه هزینه مستقیم نیروی کار در هر غذاست"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="کارکنان فعال" value={faDigits(active.length)} />
        <KpiCard
          label="هزینه ماهانه کل"
          value={formatCurrency(totalMonthly, { symbol, compact: true })}
          sub="شامل بیمه و مزایا"
        />
        <KpiCard
          label="نرخ دقیقه آشپزخانه"
          value={formatCurrency(kitchenMinutes, { symbol })}
          sub={`${faDigits(kitchen.length)} نفر، به‌صورت هم‌زمان`}
        />
        <KpiCard
          label="نرخ استفاده‌شده در موتور"
          value={formatCurrency(profile?.laborCostPerMinute.toString() ?? '0', { symbol })}
          tone="accent"
          sub="قابل تغییر در موتور قیمت‌گذاری"
        />
      </div>

      <section className="mt-6">
        <Table>
          <thead>
            <tr className="border-b border-ink-800">
              <th className="th">نام</th>
              <th className="th">سمت</th>
              <th className="th">بخش</th>
              <th className="th">نوع حقوق</th>
              <th className="th">مبلغ پایه</th>
              <th className="th">بیمه و مزایا</th>
              <th className="th">هزینه ماهانه واقعی</th>
              <th className="th">ساعت ماهانه</th>
              <th className="th">هزینه هر ساعت</th>
              <th className="th">هزینه هر دقیقه</th>
              <th className="th">وضعیت</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-850">
            {employees.map((employee) => {
              const c = costs(employee);
              return (
                <tr key={employee.id} className={employee.isActive ? '' : 'opacity-50'}>
                  <td className="td">{employee.name}</td>
                  <td className="td text-ink-400">{employee.role}</td>
                  <td className="td text-2xs text-ink-500">{employee.department ?? '—'}</td>
                  <td className="td text-2xs text-ink-400">{SALARY_LABELS[employee.salaryType]}</td>
                  <td className="td tabular text-ink-400">
                    {formatCurrency(employee.salaryAmount.toString(), { compact: true })}
                  </td>
                  <td className="td tabular text-ink-500">
                    {formatPercent(employee.burdenPercent.toString(), { decimals: 0 })}
                  </td>
                  <td className="td tabular text-ink-100">{formatCurrency(c.monthly, { compact: true })}</td>
                  <td className="td tabular text-ink-500">{faDigits(Number(employee.monthlyHours))}</td>
                  <td className="td tabular text-ink-400">{formatCurrency(c.perHour, { compact: true })}</td>
                  <td className="td tabular text-saffron-400">{formatCurrency(c.perMinute)}</td>
                  <td className="td">
                    <Badge tone={employee.isActive ? 'positive' : 'neutral'}>
                      {employee.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="mt-2 text-2xs leading-6 text-ink-500">
          «هزینه ماهانه واقعی» شامل بیمه و مزایای کارفرماست. محاسبه هزینه نیروی کار بر پایه حقوق
          خام، هزینه واقعی هر دقیقه آشپزخانه را کمتر از واقع نشان می‌دهد و در نتیجه قیمت
          تمام‌شده غذاها پایین‌تر از حقیقت برآورد می‌شود.
        </p>
      </section>
    </>
  );
}
