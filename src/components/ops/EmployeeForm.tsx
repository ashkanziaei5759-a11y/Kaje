'use client';

import { useState } from 'react';
import { RecordForm } from './RecordForm';
import { SelectField, NumberField, PercentField, TextField } from '@/components/cost/fields';
import { faDigits } from '@/lib/format';

const SALARY_TYPES: [string, string][] = [
  ['MONTHLY', 'ماهانه'],
  ['DAILY', 'روزانه'],
  ['HOURLY', 'ساعتی'],
];

export function EmployeeForm({ currency }: { currency: string }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [salaryType, setSalaryType] = useState('MONTHLY');
  const [salaryAmount, setSalaryAmount] = useState('');
  const [monthlyHours, setMonthlyHours] = useState('208');
  const [burdenPercent, setBurdenPercent] = useState('0.23');
  const [phone, setPhone] = useState('');
  const [resetKey, setResetKey] = useState(0);

  // The same arithmetic the cost engine uses, shown here so the number is not a
  // mystery: the true hourly cost is salary plus its burden, over hours worked.
  const hours = Number(monthlyHours);
  const loaded = Number(salaryAmount) * (1 + Number(burdenPercent));
  const perHour = salaryType === 'HOURLY' ? loaded : hours > 0 ? loaded / hours : 0;

  return (
    <RecordForm
      key={resetKey}
      title="افزودن کارمند"
      explain={
        <>
          حقوق آشپزخانه بخشی از قیمت تمام‌شدهٔ غذاست. سیستم از این اطلاعات{' '}
          <b>هزینهٔ هر ساعت کار</b> را حساب می‌کند و بر اساس دقیقه‌های کاری که در
          دستور پخت هر غذا ثبت کرده‌اید، سهم دستمزد را روی آن غذا می‌آورد.
        </>
      }
      submitLabel="ثبت کارمند"
      endpoint="/api/employees"
      buildBody={() => {
        if (!name.trim()) return { ok: false, error: 'نام را وارد کنید.' };
        if (!role.trim()) return { ok: false, error: 'سمت را وارد کنید.' };
        if (!salaryAmount) return { ok: false, error: 'حقوق را وارد کنید.' };
        return {
          ok: true,
          body: {
            name: name.trim(),
            role: role.trim(),
            phone: phone || null,
            salaryType,
            salaryAmount,
            monthlyHours,
            burdenPercent,
            isActive: true,
          },
        };
      }}
      describeSuccess={(r: { name: string }) => `«${r.name}» ثبت شد.`}
      onSuccess={() => setResetKey((k) => k + 1)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="نام" value={name} onChange={setName} required />
        <TextField
          label="سمت"
          value={role}
          onChange={setRole}
          hint="مثلاً «سرآشپز» یا «کمک آشپز»."
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="نوع حقوق"
          value={salaryType}
          onChange={setSalaryType}
          options={SALARY_TYPES}
        />
        <NumberField
          label="مبلغ حقوق"
          value={salaryAmount}
          onChange={setSalaryAmount}
          suffix={currency}
          hint="خالص حقوق، بدون بیمه و مزایا — آن را در فیلد بعدی می‌گیریم."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="ساعت کاری در ماه"
          value={monthlyHours}
          onChange={setMonthlyHours}
          suffix="ساعت"
          hint="پیش‌فرض ۲۰۸ ساعت (۸ ساعت، ۲۶ روز)."
          disabled={salaryType === 'HOURLY'}
        />
        <PercentField
          label="بیمه و مزایا"
          value={burdenPercent}
          onChange={setBurdenPercent}
          hint="چند درصد روی حقوق اضافه می‌شود؟ معمولاً حدود ۲۳٪."
        />
      </div>

      <TextField label="تلفن" type="tel" value={phone} onChange={setPhone} hint="اختیاری." />

      {perHour > 0 ? (
        <div className="rounded-xl border border-azure-500/30 bg-azure-300/10 px-4 py-3">
          <p className="text-2xs text-ink-700">هزینهٔ واقعی هر ساعت کار این نفر</p>
          <p className="tabular mt-0.5 text-xl font-bold text-azure-700">
            {faDigits(Math.round(perHour).toLocaleString('en-US'))} {currency}
          </p>
          <p className="mt-1 text-2xs leading-5 text-ink-600">
            یعنی حقوق به‌علاوهٔ بیمه و مزایا، تقسیم بر ساعت کاری ماه. همین عدد در
            قیمت تمام‌شدهٔ غذا استفاده می‌شود.
          </p>
        </div>
      ) : null}
    </RecordForm>
  );
}
