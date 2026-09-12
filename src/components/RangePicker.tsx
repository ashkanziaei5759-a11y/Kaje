'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

const PRESETS = [
  ['today', 'امروز'],
  ['yesterday', 'دیروز'],
  ['this_week', 'این هفته'],
  ['this_month', 'این ماه'],
  ['last_month', 'ماه گذشته'],
] as const;

export function RangePicker({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(range: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', range);
    // A preset replaces any custom range that was set.
    params.delete('from');
    params.delete('to');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-ink-0 p-1">
      {PRESETS.map(([value, label]) => (
        <button
          key={value}
          onClick={() => select(value)}
          aria-pressed={current === value}
          className={`rounded-md px-3 py-1.5 text-2xs transition-colors ${
            current === value
              ? 'bg-forest-500 text-ink-50 font-semibold'
              : 'text-ink-600 hover:bg-ink-200 hover:text-ink-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
