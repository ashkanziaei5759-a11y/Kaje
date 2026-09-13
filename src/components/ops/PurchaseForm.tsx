'use client';

import { useMemo, useState } from 'react';
import { RecordForm } from './RecordForm';
import { SelectField, TextField, TextAreaField, NumberField } from '@/components/cost/fields';
import { faDigits } from '@/lib/format';

export interface PurchaseOption {
  id: string;
  label: string;
  /** Purchase unit, so the manager types the number written on the invoice. */
  unit: string;
  lastPrice: string;
}

interface Line {
  key: number;
  ingredientId: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 1;
const blank = (): Line => ({ key: nextKey++, ingredientId: '', quantity: '', unitPrice: '' });

export function PurchaseForm({
  suppliers,
  ingredients,
  currency,
  canApprove,
}: {
  suppliers: { id: string; label: string }[];
  ingredients: PurchaseOption[];
  currency: string;
  canApprove: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [resetKey, setResetKey] = useState(0);

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  function update(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /** Choosing an ingredient prefills the last price paid — usually right, always editable. */
  function chooseIngredient(key: number, ingredientId: string) {
    const known = byId.get(ingredientId);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, ingredientId, unitPrice: l.unitPrice || (known?.lastPrice ?? '') }
          : l,
      ),
    );
  }

  const filled = lines.filter((l) => l.ingredientId && l.quantity && l.unitPrice);
  const total = filled.reduce(
    (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
    0,
  );

  return (
    <RecordForm
      key={resetKey}
      title="ثبت فاکتور خرید"
      explain={
        <>
          فاکتوری که از تأمین‌کننده گرفته‌اید را همان‌طور که نوشته شده وارد کنید.
          با ثبت آن سه اتفاق می‌افتد: <b>موجودی انبار</b> زیاد می‌شود،{' '}
          <b>قیمت میانگین</b> هر ماده با قیمت جدید بازمحاسبه می‌شود، و در نتیجه{' '}
          <b>قیمت تمام‌شدهٔ هر غذایی</b> که از آن ماده استفاده می‌کند خودبه‌خود
          به‌روز می‌شود. اگر قیمتی بیش از ۱۰٪ جهش کند، سیستم هشدار می‌دهد.
        </>
      }
      submitLabel="ثبت فاکتور و افزودن به انبار"
      endpoint="/api/purchases"
      disabled={!canApprove}
      buildBody={() => {
        if (!supplierId) return { ok: false, error: 'تأمین‌کننده را انتخاب کنید.' };
        if (filled.length === 0) {
          return { ok: false, error: 'حداقل یک قلم با مقدار و قیمت وارد کنید.' };
        }
        return {
          ok: true,
          body: {
            supplierId,
            purchaseDate,
            invoiceNumber: invoiceNumber || null,
            notes: notes || null,
            approve: true,
            lines: filled.map((l) => ({
              ingredientId: l.ingredientId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
        };
      }}
      describeSuccess={(r: { linesApplied: number; alertsRaised: number; totalAmount: string }) =>
        `فاکتور ثبت شد: ${faDigits(r.linesApplied)} قلم به انبار اضافه شد` +
        (Number(r.alertsRaised) > 0
          ? ` — ${faDigits(r.alertsRaised)} هشدار جهش قیمت ثبت شد، در صفحهٔ هشدارها ببینید.`
          : '.')
      }
      onSuccess={() => setResetKey((k) => k + 1)}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="تأمین‌کننده"
          value={supplierId}
          onChange={setSupplierId}
          hint="از چه کسی خریدید؟"
          options={[['', 'انتخاب کنید…'], ...suppliers.map((s) => [s.id, s.label] as [string, string])]}
        />
        <TextField
          label="تاریخ فاکتور"
          type="date"
          value={purchaseDate}
          onChange={setPurchaseDate}
          hint="روزی که کالا تحویل گرفته شد."
        />
        <TextField
          label="شمارهٔ فاکتور"
          value={invoiceNumber}
          onChange={setInvoiceNumber}
          dir="ltr"
          hint="اختیاری — برای پیدا کردن بعدی."
        />
      </div>

      <div>
        <p className="label mb-2">اقلام فاکتور</p>
        <p className="mb-3 text-2xs leading-6 text-ink-600">
          مقدار و قیمت را دقیقاً به همان واحدی وارد کنید که روی فاکتور نوشته شده —
          واحد هر ماده کنار آن نوشته شده است. قیمت واحد یعنی قیمت یک واحد، نه کل ردیف.
        </p>

        <div className="space-y-3">
          {lines.map((line, index) => {
            const chosen = byId.get(line.ingredientId);
            const lineTotal = Number(line.quantity) * Number(line.unitPrice);
            return (
              <div key={line.key} className="card-inset p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-start">
                  <SelectField
                    label={`قلم ${faDigits(index + 1)}`}
                    value={line.ingredientId}
                    onChange={(v) => chooseIngredient(line.key, v)}
                    options={[
                      ['', 'ماده اولیه…'],
                      ...ingredients.map((i) => [i.id, i.label] as [string, string]),
                    ]}
                  />
                  <NumberField
                    label="مقدار"
                    value={line.quantity}
                    onChange={(v) => update(line.key, { quantity: v })}
                    suffix={chosen?.unit}
                    hint={chosen ? `به ${chosen.unit}` : undefined}
                  />
                  <NumberField
                    label="قیمت واحد"
                    value={line.unitPrice}
                    onChange={(v) => update(line.key, { unitPrice: v })}
                    suffix={currency}
                    hint={
                      chosen && chosen.lastPrice
                        ? `آخرین خرید: ${faDigits(Number(chosen.lastPrice).toLocaleString('en-US'))}`
                        : undefined
                    }
                  />
                  <div className="flex items-end gap-2 sm:pt-6">
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="btn-ghost min-h-11 px-3 text-2xs"
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        aria-label={`حذف قلم ${faDigits(index + 1)}`}
                      >
                        حذف
                      </button>
                    ) : null}
                  </div>
                </div>
                {lineTotal > 0 ? (
                  <p className="mt-2 text-2xs text-ink-600">
                    جمع این ردیف:{' '}
                    <span className="tabular font-medium text-ink-800">
                      {faDigits(Math.round(lineTotal).toLocaleString('en-US'))} {currency}
                    </span>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="btn-ghost mt-3 min-h-11 px-4 text-2xs"
          onClick={() => setLines((prev) => [...prev, blank()])}
        >
          + افزودن قلم دیگر
        </button>
      </div>

      <TextAreaField
        label="توضیح"
        value={notes}
        onChange={setNotes}
        hint="اختیاری — مثلاً «کیفیت گوشت پایین بود» یا «تحویل با یک روز تأخیر»."
      />

      <div className="rounded-xl border border-forest-500/30 bg-forest-300/10 px-4 py-3">
        <p className="text-2xs text-ink-700">جمع کل فاکتور</p>
        <p className="tabular mt-0.5 text-xl font-bold text-forest-700">
          {faDigits(Math.round(total).toLocaleString('en-US'))} {currency}
        </p>
      </div>

      {!canApprove ? (
        <p className="text-2xs leading-6 text-pomegranate-600">
          نقش شما اجازهٔ تأیید فاکتور و تغییر موجودی انبار را ندارد. برای این کار
          با مدیر یا مالک تماس بگیرید.
        </p>
      ) : null}
    </RecordForm>
  );
}
