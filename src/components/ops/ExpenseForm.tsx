'use client';

import { useState } from 'react';
import { RecordForm } from './RecordForm';
import { SelectField, NumberField, TextField, TextAreaField } from '@/components/cost/fields';
import { faDigits } from '@/lib/format';

const TYPES: [string, string][] = [
  ['FIXED', 'ثابت — هر ماه تکرار می‌شود (اجاره، حقوق)'],
  ['VARIABLE', 'متغیر — به میزان فروش بستگی دارد (برق، گاز)'],
  ['ONE_TIME', 'یک‌بار — خرید یا تعمیر مقطعی'],
];

export function ExpenseForm({
  categories,
  suppliers,
  currency,
}: {
  categories: { id: string; label: string; isOverhead: boolean }[];
  suppliers: { id: string; label: string }[];
  currency: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('VARIABLE');
  const [expenseDate, setExpenseDate] = useState(today);
  const [payee, setPayee] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [description, setDescription] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const chosen = categories.find((c) => c.id === categoryId);

  return (
    <RecordForm
      key={resetKey}
      title="ثبت هزینه"
      explain={
        <>
          هزینه‌هایی که ماده اولیه نیستند — اجاره، برق، حقوق، تعمیرات، تبلیغات.
          هزینه‌هایی که در دستهٔ <b>سربار</b> باشند، طبق روش تخصیصی که در تنظیمات
          انتخاب کرده‌اید، سهمشان روی <b>قیمت تمام‌شدهٔ هر غذا</b> پخش می‌شود. پس
          ثبت نکردنشان یعنی سود را بیشتر از واقعیت دیدن.
        </>
      }
      submitLabel="ثبت هزینه"
      endpoint="/api/expenses"
      buildBody={() => {
        if (!categoryId) return { ok: false, error: 'دستهٔ هزینه را انتخاب کنید.' };
        if (!amount || Number(amount) <= 0) return { ok: false, error: 'مبلغ را وارد کنید.' };
        return {
          ok: true,
          body: {
            categoryId,
            amount,
            type,
            expenseDate,
            payee: payee || null,
            supplierId: supplierId || null,
            description: description || null,
          },
        };
      }}
      describeSuccess={(r: { amount: string; category: string }) =>
        `ثبت شد — ${faDigits(Math.round(Number(r.amount)).toLocaleString('en-US'))} ${currency} در دستهٔ «${r.category}».`
      }
      onSuccess={() => setResetKey((k) => k + 1)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="دستهٔ هزینه"
          value={categoryId}
          onChange={setCategoryId}
          hint={
            chosen
              ? chosen.isOverhead
                ? 'این دسته سربار است و روی قیمت تمام‌شدهٔ غذاها اثر می‌گذارد.'
                : 'این دسته سربار نیست و روی قیمت تمام‌شده پخش نمی‌شود.'
              : 'دسته تعیین می‌کند این هزینه روی قیمت غذاها اثر بگذارد یا نه.'
          }
          options={[
            ['', 'انتخاب کنید…'],
            ...categories.map((c) => [c.id, c.label] as [string, string]),
          ]}
        />
        <NumberField
          label="مبلغ"
          value={amount}
          onChange={setAmount}
          suffix={currency}
          hint="مبلغ کل پرداختی."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="نوع هزینه" value={type} onChange={setType} options={TYPES} />
        <TextField
          label="تاریخ"
          type="date"
          value={expenseDate}
          onChange={setExpenseDate}
          hint="روزی که هزینه انجام شد."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="پرداخت به"
          value={payee}
          onChange={setPayee}
          hint="اختیاری — نام شخص یا شرکت."
        />
        <SelectField
          label="تأمین‌کننده"
          value={supplierId}
          onChange={setSupplierId}
          hint="اختیاری — اگر طرف حساب از قبل ثبت شده."
          options={[
            ['', '—'],
            ...suppliers.map((s) => [s.id, s.label] as [string, string]),
          ]}
        />
      </div>

      <TextAreaField label="توضیح" value={description} onChange={setDescription} hint="اختیاری." />
    </RecordForm>
  );
}
