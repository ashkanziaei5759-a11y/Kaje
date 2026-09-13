'use client';

import { useMemo, useState } from 'react';
import { RecordForm } from './RecordForm';
import { SelectField, NumberField, TextAreaField } from '@/components/cost/fields';
import { faDigits } from '@/lib/format';

const REASONS: [string, string][] = [
  ['SPOILAGE', 'فاسد شد'],
  ['EXPIRED', 'تاریخ گذشت'],
  ['BURNED', 'سوخت'],
  ['PREPARATION', 'حین آماده‌سازی (پاک کردن، دور ریز)'],
  ['OVERPRODUCTION', 'بیش از نیاز پخته شد'],
  ['DAMAGED', 'آسیب دید یا ریخت'],
  ['OTHER', 'دلیل دیگر'],
];

export function WasteForm({
  ingredients,
  currency,
}: {
  ingredients: { id: string; label: string; unit: string; avgCost: string; inStock: string }[];
  currency: string;
}) {
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('SPOILAGE');
  const [notes, setNotes] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const chosen = useMemo(
    () => ingredients.find((i) => i.id === ingredientId),
    [ingredientId, ingredients],
  );
  // An estimate only. The real figure comes from the warehouse's weighted
  // average at the instant of the write, which is what the server records.
  const estimate = chosen && quantity ? Number(chosen.avgCost) * Number(quantity) : 0;
  const overStock = chosen && quantity ? Number(quantity) > Number(chosen.inStock) : false;

  return (
    <RecordForm
      key={resetKey}
      title="ثبت ضایعات"
      explain={
        <>
          هر چیزی که دور ریخته شد را همین‌جا ثبت کنید. با ثبت، <b>از موجودی انبار کم می‌شود</b> و
          هزینه‌اش به قیمتی که واقعاً خریده‌اید حساب می‌شود — نه قیمت روز. ثبت نکردنش
          باعث می‌شود انبار روی کاغذ بیشتر از واقعیت نشان بدهد و سود واقعی گم شود.
        </>
      }
      submitLabel="ثبت ضایعات"
      endpoint="/api/waste"
      buildBody={() => {
        if (!ingredientId) return { ok: false, error: 'ماده اولیه را انتخاب کنید.' };
        if (!quantity || Number(quantity) <= 0) {
          return { ok: false, error: 'مقدار را وارد کنید.' };
        }
        return { ok: true, body: { ingredientId, quantity, reason, notes: notes || null } };
      }}
      describeSuccess={(r: { ingredient: string; totalCost: string }) =>
        `ثبت شد — ${r.ingredient} به ارزش ${faDigits(
          Math.round(Number(r.totalCost)).toLocaleString('en-US'),
        )} ${currency} از انبار کم شد.`
      }
      onSuccess={() => setResetKey((k) => k + 1)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="چه چیزی دور ریخته شد؟"
          value={ingredientId}
          onChange={setIngredientId}
          options={[
            ['', 'ماده اولیه…'],
            ...ingredients.map((i) => [i.id, i.label] as [string, string]),
          ]}
        />
        <NumberField
          label="چه مقدار؟"
          value={quantity}
          onChange={setQuantity}
          suffix={chosen?.unit}
          hint={
            chosen
              ? `موجودی فعلی: ${faDigits(Number(chosen.inStock).toLocaleString('en-US'))} ${chosen.unit}`
              : 'اول ماده اولیه را انتخاب کنید.'
          }
          error={overStock ? 'بیشتر از موجودی انبار است — موجودی منفی می‌شود.' : null}
        />
      </div>

      <SelectField
        label="چرا؟"
        value={reason}
        onChange={setReason}
        hint="دلیل درست باعث می‌شود گزارش ضایعات نشان بدهد مشکل کجاست."
        options={REASONS}
      />

      <TextAreaField
        label="توضیح"
        value={notes}
        onChange={setNotes}
        hint="اختیاری — مثلاً «یخچال خراب شد»."
      />

      {estimate > 0 ? (
        <div className="rounded-xl border border-pomegranate-400/30 bg-pomegranate-300/10 px-4 py-3">
          <p className="text-2xs text-ink-700">ارزش تقریبی این ضایعات</p>
          <p className="tabular mt-0.5 text-xl font-bold text-pomegranate-600">
            {faDigits(Math.round(estimate).toLocaleString('en-US'))} {currency}
          </p>
        </div>
      ) : null}
    </RecordForm>
  );
}
