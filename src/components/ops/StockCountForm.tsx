'use client';

import { useState } from 'react';
import { RecordForm } from './RecordForm';
import { TextAreaField } from '@/components/cost/fields';
import { faDigits } from '@/lib/format';

export interface CountRow {
  id: string;
  label: string;
  unit: string;
  systemQuantity: string;
}

export function StockCountForm({ rows }: { rows: CountRow[] }) {
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [resetKey, setResetKey] = useState(0);

  // Only rows the manager actually typed a number into are submitted. Leaving a
  // row blank means "I did not count this", which is very different from
  // counting it and finding zero — treating them alike would wipe real stock.
  const filled = rows.filter((r) => counted[r.id] !== undefined && counted[r.id] !== '');

  return (
    <RecordForm
      key={resetKey}
      title="انبارگردانی"
      explain={
        <>
          آنچه واقعاً در انبار هست را بشمارید و همین‌جا وارد کنید. سیستم تفاوت آن با
          موجودی دفتری را حساب می‌کند و <b>عدد شمارش‌شدهٔ شما را درست می‌گیرد</b>.
          اختلاف‌ها معمولاً از ضایعات ثبت‌نشده، اشتباه در تحویل یا سرقت می‌آید و در
          گزارش مغایرت دیده می‌شود. <b>ردیفی که خالی بگذارید دست‌نخورده می‌ماند</b> —
          یعنی «نشمردم»، نه «صفر بود».
        </>
      }
      submitLabel={
        filled.length > 0 ? `ثبت شمارش ${faDigits(filled.length)} قلم` : 'ثبت شمارش'
      }
      endpoint="/api/stock-count"
      buildBody={() => {
        if (filled.length === 0) {
          return { ok: false, error: 'حداقل برای یک قلم عدد شمارش را وارد کنید.' };
        }
        return {
          ok: true,
          body: {
            notes: notes || null,
            lines: filled.map((r) => ({ ingredientId: r.id, countedQuantity: counted[r.id] })),
          },
        };
      }}
      describeSuccess={(r: { linesCounted: number; adjusted: number }) =>
        Number(r.adjusted) === 0
          ? `شمارش ${faDigits(r.linesCounted)} قلم ثبت شد — هیچ مغایرتی نبود، انبار دقیق است.`
          : `شمارش ${faDigits(r.linesCounted)} قلم ثبت شد و موجودی ${faDigits(r.adjusted)} قلم اصلاح شد.`
      }
      onSuccess={() => {
        setCounted({});
        setResetKey((k) => k + 1);
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-2xs">
          <thead>
            <tr className="border-b border-ink-200 text-right text-ink-600">
              <th scope="col" className="py-2 font-medium">ماده اولیه</th>
              <th scope="col" className="py-2 font-medium">موجودی دفتری</th>
              <th scope="col" className="py-2 font-medium">شمارش شما</th>
              <th scope="col" className="py-2 font-medium">اختلاف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((row) => {
              const typed = counted[row.id];
              const has = typed !== undefined && typed !== '';
              const delta = has ? Number(typed) - Number(row.systemQuantity) : 0;
              return (
                <tr key={row.id}>
                  <th scope="row" className="py-2 pl-3 text-right font-normal text-ink-800">
                    {row.label}
                  </th>
                  <td className="tabular py-2 pl-3 text-ink-600">
                    {faDigits(Number(row.systemQuantity).toLocaleString('en-US'))} {row.unit}
                  </td>
                  <td className="py-2 pl-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      dir="ltr"
                      className="input h-10 w-28 text-left"
                      aria-label={`شمارش ${row.label}`}
                      value={typed ?? ''}
                      onChange={(e) =>
                        setCounted((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                    />
                  </td>
                  <td className="tabular py-2">
                    {!has ? (
                      <span className="text-ink-300">—</span>
                    ) : delta === 0 ? (
                      <span className="text-forest-700">دقیق</span>
                    ) : (
                      <span className={delta < 0 ? 'text-pomegranate-600' : 'text-azure-700'}>
                        {delta > 0 ? '+' : '−'}
                        {faDigits(Math.abs(delta).toLocaleString('en-US'))} {row.unit}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TextAreaField
        label="توضیح"
        value={notes}
        onChange={setNotes}
        hint="اختیاری — مثلاً «انبارگردانی پایان ماه»."
      />
    </RecordForm>
  );
}
