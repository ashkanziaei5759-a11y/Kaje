'use client';

const REPORTS = [
  ['profit-loss', 'سود و زیان'],
  ['item-profitability', 'سودآوری آیتم‌ها'],
  ['menu-costing', 'قیمت تمام‌شده'],
  ['inventory', 'موجودی انبار'],
  ['price-history', 'تغییرات قیمت'],
  ['waste', 'ضایعات'],
] as const;

export function ExportButtons({ range }: { range: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-ink-0 p-1">
      <span className="px-2 text-2xs text-ink-600">خروجی CSV</span>
      <select
        onChange={(e) => {
          if (!e.target.value) return;
          window.location.href = `/api/reports/export?report=${e.target.value}&range=${range}`;
          e.target.value = '';
        }}
        defaultValue=""
        aria-label="انتخاب گزارش برای دریافت خروجی"
        className="rounded-md bg-ink-100 px-2 py-1.5 text-2xs text-ink-700 border border-ink-300 focus:border-forest-500 focus:outline-none"
      >
        <option value="" disabled>انتخاب گزارش…</option>
        {REPORTS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </div>
  );
}
