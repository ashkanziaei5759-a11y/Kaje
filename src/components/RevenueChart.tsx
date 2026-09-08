'use client';

import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/format';
import { formatJalali } from '@/lib/jalali';

export interface SeriesPoint {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orders: number;
}

export function RevenueChart({ data }: { data: SeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="grid h-64 place-items-center text-2xs text-ink-500">
        فروشی در این بازه ثبت نشده است.
      </div>
    );
  }

  const points = data.map((d) => ({ ...d, label: formatJalali(new Date(d.date), 'short') }));

  return (
    <div className="h-64" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8A33D" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#E8A33D" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7FB069" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#7FB069" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="#1C222D" vertical={false} />
          <XAxis
            dataKey="label" tick={{ fill: '#7A8899', fontSize: 10 }}
            axisLine={false} tickLine={false} minTickGap={24} reversed
          />
          <YAxis
            tick={{ fill: '#7A8899', fontSize: 10 }} axisLine={false} tickLine={false}
            width={52} orientation="right"
            tickFormatter={(v) => formatCurrency(v, { compact: true, persianDigits: false })}
          />
          <Tooltip
            contentStyle={{
              background: '#161B24', border: '1px solid #28313F',
              borderRadius: 10, fontSize: 12, direction: 'rtl',
            }}
            labelStyle={{ color: '#C9D1DA', marginBottom: 4 }}
            formatter={(value: number, name) => [
              formatCurrency(value, { compact: true }),
              { revenue: 'فروش', cost: 'قیمت تمام‌شده', profit: 'سود' }[name as string] ?? name,
            ]}
          />
          <Area type="monotone" dataKey="revenue" stroke="#E8A33D" strokeWidth={2} fill="url(#revenueFill)" />
          <Area type="monotone" dataKey="profit" stroke="#7FB069" strokeWidth={2} fill="url(#profitFill)" />
          <Area type="monotone" dataKey="cost" stroke="#556478" strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
