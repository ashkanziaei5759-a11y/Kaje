import { requireUser } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { getExpenseSummary, resolveRange, type RangePreset } from '@/server/services/reports';
import { PageHeader, KpiCard, Table, Badge } from '@/components/ui';
import { RangePicker } from '@/components/RangePicker';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { ExpenseForm } from '@/components/ops/ExpenseForm';

export const metadata = { title: 'هزینه‌ها' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  FIXED: 'ثابت', VARIABLE: 'متغیر', ONE_TIME: 'یک‌باره', RECURRING: 'تکرارشونده',
};
const PRESETS: RangePreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month'];

export default async function ExpensesPage({
  searchParams,
}: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const preset = (PRESETS.includes(params.range as RangePreset) ? params.range : 'this_month') as RangePreset;
  const range = resolveRange(preset);

  const [restaurant, summary, expenses] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
    getExpenseSummary(user.restaurantId, range),
    prisma.expense.findMany({
      where: { restaurantId: user.restaurantId, expenseDate: { gte: range.from, lte: range.to } },
      include: { category: true, supplier: true, createdBy: true },
      orderBy: { expenseDate: 'desc' },
    }),
  ]);

  const symbol = restaurant?.currencySymbol ?? '';

  const canWrite = hasPermission(user.permissions, PERMISSIONS.EXPENSE_WRITE);
  const [expenseCategories, expenseSuppliers] = canWrite
    ? await Promise.all([
        prisma.expenseCategory.findMany({
          where: { restaurantId: user.restaurantId },
          orderBy: { namePersian: 'asc' },
        }),
        prisma.supplier.findMany({
          where: { restaurantId: user.restaurantId, isActive: true },
          orderBy: { name: 'asc' },
        }),
      ])
    : [[], []];
  const total = Number(summary.total);

  return (
    <>
      <PageHeader
        title="هزینه‌ها"
        subtitle="هزینه‌های سربار و حقوق — پایه تخصیص سربار به هر پرس"
        action={<RangePicker current={preset} />}
      />

      {canWrite ? (
        <ExpenseForm
          currency={symbol}
          categories={expenseCategories.map((c) => ({
            id: c.id,
            label: c.namePersian,
            isOverhead: c.isOverhead,
          }))}
          suppliers={expenseSuppliers.map((s) => ({ id: s.id, label: s.namePersian || s.name }))}
        />
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="کل هزینه دوره" value={formatCurrency(summary.total, { symbol, compact: true })} />
        <KpiCard label="سربار" value={formatCurrency(summary.overhead, { symbol, compact: true })} />
        <KpiCard label="حقوق و دستمزد" value={formatCurrency(summary.labor, { symbol, compact: true })} />
        <KpiCard label="تعداد رکورد" value={faDigits(expenses.length)} />
      </div>

      <section className="mt-6 card p-4">
        <h2 className="text-sm font-semibold text-ink-800">به تفکیک دسته</h2>
        <ul className="mt-3 space-y-2">
          {summary.byCategory.map((category) => (
            <li key={category.namePersian}>
              <div className="flex items-baseline justify-between text-2xs">
                <span className="text-ink-600">
                  {category.namePersian}
                  {category.isLabor && <span className="mr-2 text-ink-400">حقوق</span>}
                </span>
                <span className="tabular text-ink-700">
                  {formatCurrency(category.amount, { compact: true })}
                  <span className="mr-2 text-ink-400">
                    {formatPercent(total > 0 ? Number(category.amount) / total : 0, { decimals: 0 })}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={`h-full rounded-full ${category.isLabor ? 'bg-ink-500' : 'bg-forest-500'}`}
                  style={{ width: `${total > 0 ? (Number(category.amount) / total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">رکوردهای هزینه</h2>
        {expenses.length === 0 ? (
          <div className="card p-8 text-center text-2xs text-ink-600">
            در این بازه هزینه‌ای ثبت نشده است.
          </div>
        ) : (
          <Table>
            <thead>
              <tr className="border-b border-ink-200">
                <th className="th">تاریخ</th>
                <th className="th">دسته</th>
                <th className="th">شرح</th>
                <th className="th">نوع</th>
                <th className="th">دریافت‌کننده</th>
                <th className="th">مبلغ</th>
                <th className="th">ثبت‌کننده</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="td text-2xs text-ink-600">{formatJalali(expense.expenseDate)}</td>
                  <td className="td">{expense.category.namePersian}</td>
                  <td className="td text-ink-600 max-w-[16rem] truncate">{expense.description ?? '—'}</td>
                  <td className="td">
                    <Badge tone={expense.type === 'FIXED' ? 'neutral' : 'warning'}>
                      {TYPE_LABELS[expense.type]}
                    </Badge>
                  </td>
                  <td className="td text-2xs text-ink-600">
                    {expense.supplier?.namePersian ?? expense.payee ?? '—'}
                  </td>
                  <td className="td tabular text-ink-800">
                    {formatCurrency(expense.amount.toString(), { compact: true })}
                  </td>
                  <td className="td text-2xs text-ink-600">{expense.createdBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
