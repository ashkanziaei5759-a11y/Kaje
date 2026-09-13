'use client';

import { useState } from 'react';
import { RecordForm } from './RecordForm';
import { TextField, TextAreaField } from '@/components/cost/fields';

export function SupplierForm() {
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [address, setAddress] = useState('');
  const [resetKey, setResetKey] = useState(0);

  return (
    <RecordForm
      key={resetKey}
      title="افزودن تأمین‌کننده"
      explain={
        <>
          کسانی که از آن‌ها خرید می‌کنید. برای ثبت فاکتور خرید لازم است، و باعث
          می‌شود بتوانید ببینید <b>قیمت یک ماده نزد کدام تأمین‌کننده ارزان‌تر است</b>.
          فقط نام اجباری است؛ بقیه هر وقت خواستید.
        </>
      }
      submitLabel="ثبت تأمین‌کننده"
      endpoint="/api/suppliers"
      buildBody={() => {
        if (!name.trim()) return { ok: false, error: 'نام تأمین‌کننده را وارد کنید.' };
        return {
          ok: true,
          body: {
            name: name.trim(),
            namePersian: name.trim(),
            contactPerson: contactPerson || null,
            phone: phone || null,
            email: email || null,
            paymentTerms: paymentTerms || null,
            address: address || null,
            isActive: true,
          },
        };
      }}
      describeSuccess={(r: { name: string }) => `«${r.name}» ثبت شد و در فهرست خرید در دسترس است.`}
      onSuccess={() => setResetKey((k) => k + 1)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="نام" value={name} onChange={setName} hint="مثلاً «پروتئین البرز»." required />
        <TextField
          label="شخص رابط"
          value={contactPerson}
          onChange={setContactPerson}
          hint="اختیاری — با چه کسی هماهنگ می‌کنید؟"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="تلفن" type="tel" value={phone} onChange={setPhone} hint="اختیاری." />
        <TextField label="ایمیل" type="email" value={email} onChange={setEmail} hint="اختیاری." />
      </div>
      <TextField
        label="شرایط پرداخت"
        value={paymentTerms}
        onChange={setPaymentTerms}
        hint="اختیاری — مثلاً «نقدی» یا «۳۰ روزه»."
      />
      <TextAreaField label="آدرس" value={address} onChange={setAddress} hint="اختیاری." />
    </RecordForm>
  );
}
