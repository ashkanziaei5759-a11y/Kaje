'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NumberField, SelectField, Field } from './fields';
import { formatCurrency, faDigits } from '@/lib/format';

/**
 * Adds a new raw material.
 *
 * The form is arranged around the one idea people get wrong: the conversion
 * factor. You buy by the kilo and cook by the gram, and the factor is what
 * connects them. Rather than explaining it in help text, the form shows the
 * resulting cost per recipe unit live — so a wrong factor is visible as an
 * absurd number ("۸۵۰٬۰۰۰ per gram") before it is ever saved.
 */

export interface UnitOption { id: string; code: string; label: string }
export interface SupplierOption { id: string; name: string }

const CATEGORIES: Array<[string, string]> = [
  ['MEAT', 'گوشت قرمز'], ['POULTRY', 'مرغ و طیور'], ['SEAFOOD', 'آبزیان'],
  ['DAIRY', 'لبنیات'], ['VEGETABLE', 'سبزیجات'], ['FRUIT', 'میوه'],
  ['GRAIN', 'غلات'], ['SPICE', 'ادویه'], ['OIL', 'روغن'],
  ['BEVERAGE', 'نوشیدنی'], ['PACKAGING', 'بسته‌بندی'],
  ['CLEANING', 'شوینده'], ['OTHER', 'سایر'],
];

/** Sensible factor for the common unit pairings, so it is rarely typed. */
function suggestFactor(purchase: string, recipe: string): string | null {
  const pair = `${purchase}>${recipe}`;
  return ({
    'kg>g': '1000', 'l>ml': '1000', 'g>g': '1', 'ml>ml': '1',
    'piece>piece': '1', 'package>piece': '1', 'box>piece': '1',
  } as Record<string, string>)[pair] ?? null;
}

export function NewIngredientForm({
  units, suppliers, symbol,
}: {
  units: UnitOption[];
  suppliers: SupplierOption[];
  symbol: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  const kg = units.find((u) => u.code === 'kg') ?? units[0];
  const g = units.find((u) => u.code === 'g') ?? units[0];

  const [form, setForm] = useState({
    namePersian: '',
    category: 'OTHER',
    purchaseUnitId: kg?.id ?? '',
    recipeUnitId: g?.id ?? '',
    conversionFactor: '1000',
    lastPurchasePrice: '',
    yieldPercent: '100',
    minimumStock: '0',
    reorderLevel: '0',
    defaultSupplierId: '',
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Re-suggest the factor whenever either unit changes.
      if (key === 'purchaseUnitId' || key === 'recipeUnitId') {
        const purchase = units.find((u) => u.id === next.purchaseUnitId)?.code ?? '';
        const recipe = units.find((u) => u.id === next.recipeUnitId)?.code ?? '';
        const suggested = suggestFactor(purchase, recipe);
        if (suggested) next.conversionFactor = suggested;
      }
      return next;
    });
    setError(null);
    setErrorField(null);
  }

  const purchaseCode = units.find((u) => u.id === form.purchaseUnitId)?.code ?? '';
  const recipeCode = units.find((u) => u.id === form.recipeUnitId)?.code ?? '';
  const factor = Number(form.conversionFactor) || 0;
  const price = Number(form.lastPurchasePrice) || 0;
  const yieldFraction = (Number(form.yieldPercent) || 100) / 100;
  const perRecipeUnit = factor > 0 ? price / factor : 0;
  const effective = yieldFraction > 0 ? perRecipeUnit / yieldFraction : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setErrorField(null);

    const response = await fetch('/api/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namePersian: form.namePersian.trim(),
        category: form.category,
        purchaseUnitId: form.purchaseUnitId,
        recipeUnitId: form.recipeUnitId,
        conversionFactor: String(Number(form.conversionFactor)),
        lastPurchasePrice: String(Number(form.lastPurchasePrice)),
        yieldPercent: String(yieldFraction),
        minimumStock: String(Number(form.minimumStock) || 0),
        reorderLevel: String(Number(form.reorderLevel) || 0),
        defaultSupplierId: form.defaultSupplierId || null,
        isPackaging: form.category === 'PACKAGING',
      }),
    });

    setSaving(false);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload.error ?? 'ثبت انجام نشد');
      setErrorField(payload.field ?? null);
      return;
    }

    setForm((f) => ({ ...f, namePersian: '', lastPurchasePrice: '' }));
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + افزودن ماده اولیه
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">ماده اولیه جدید</h2>
          <p className="mt-0.5 text-2xs text-ink-600">
            واحد خرید و واحد مصرف را مشخص کنید تا سیستم بتواند قیمت هر پرس را حساب کند.
          </p>
        </div>
        <button
          type="button" onClick={() => setOpen(false)}
          className="min-h-9 rounded-lg px-3 text-2xs text-ink-600 hover:bg-ink-200 hover:text-ink-700"
        >
          بستن
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="نام ماده اولیه"
          htmlFor="ing-name"
          error={errorField === 'namePersian' ? error : null}
        >
          <input
            id="ing-name" type="text" required autoComplete="off"
            value={form.namePersian}
            onChange={(e) => set('namePersian', e.target.value)}
            placeholder="مثلاً گوشت گوساله…"
            aria-invalid={errorField === 'namePersian' ? true : undefined}
            className="h-11 w-full rounded-lg border border-ink-300 bg-ink-100 px-3 text-sm
                       text-ink-900 placeholder:text-ink-400
                       focus-visible:ring-2 focus-visible:ring-forest-500 focus:border-forest-500 focus:outline-none"
          />
        </Field>

        <SelectField
          label="دسته"
          value={form.category}
          onChange={(v) => set('category', v)}
          options={CATEGORIES}
        />

        <SelectField
          label="تأمین‌کننده (اختیاری)"
          value={form.defaultSupplierId}
          onChange={(v) => set('defaultSupplierId', v)}
          options={[['', 'انتخاب نشده'], ...suppliers.map((s) => [s.id, s.name] as [string, string])]}
        />

        <SelectField
          label="واحد خرید"
          value={form.purchaseUnitId}
          onChange={(v) => set('purchaseUnitId', v)}
          options={units.map((u) => [u.id, u.label])}
          hint="همان واحدی که روی فاکتور نوشته می‌شود"
        />

        <SelectField
          label="واحد مصرف در دستور پخت"
          value={form.recipeUnitId}
          onChange={(v) => set('recipeUnitId', v)}
          options={units.map((u) => [u.id, u.label])}
          hint="همان واحدی که آشپز اندازه می‌گیرد"
        />

        <NumberField
          label="ضریب تبدیل"
          value={form.conversionFactor}
          onChange={(v) => set('conversionFactor', v)}
          error={errorField === 'conversionFactor' ? error : null}
          hint={
            purchaseCode && recipeCode
              ? `هر ۱ ${purchaseCode} چند ${recipeCode} است؟`
              : undefined
          }
        />

        <NumberField
          label="قیمت خرید هر واحد"
          value={form.lastPurchasePrice}
          onChange={(v) => set('lastPurchasePrice', v)}
          suffix={symbol}
          step="1000"
          hint={purchaseCode ? `قیمت هر ۱ ${purchaseCode}` : undefined}
        />

        <NumberField
          label="بازده مصرف"
          value={form.yieldPercent}
          onChange={(v) => set('yieldPercent', v)}
          suffix="٪"
          step="1"
          min={1}
          error={errorField === 'yieldPercent' ? error : null}
          hint="چند درصدش بعد از پاک‌کردن می‌ماند؟ ۱۰۰ یعنی بدون دورریز"
        />

        <NumberField
          label="حد سفارش مجدد"
          value={form.reorderLevel}
          onChange={(v) => set('reorderLevel', v)}
          suffix={recipeCode}
          hint="زیر این مقدار هشدار می‌دهد"
        />
      </div>

      {/* The live check that catches a wrong conversion factor. */}
      {price > 0 && factor > 0 && (
        <div className="mt-4 rounded-lg border border-ink-300 bg-ink-100 p-3">
          <p className="label mb-1.5">با این مقادیر</p>
          <p className="text-2xs leading-6 text-ink-600">
            هر <span className="tabular text-ink-800">۱ {recipeCode}</span> این ماده{' '}
            <span className="tabular font-semibold text-forest-500">
              {formatCurrency(effective, { symbol, decimals: 2 })}
            </span>{' '}
            تمام می‌شود
            {yieldFraction < 1 && (
              <span className="text-ink-600">
                {' '}(با احتساب {faDigits(form.yieldPercent)}٪ بازده؛ قیمت خام{' '}
                {formatCurrency(perRecipeUnit, { decimals: 2 })})
              </span>
            )}
            .
          </p>
          <p className="mt-1.5 text-2xs text-ink-400">
            اگر این عدد منطقی نیست، ضریب تبدیل را بررسی کنید.
          </p>
        </div>
      )}

      {error && !errorField && (
        <p role="alert" className="mt-3 rounded-lg border border-pomegranate-500/30 bg-pomegranate-500/10 px-3 py-2 text-2xs text-pomegranate-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'در حال ثبت…' : 'ثبت ماده اولیه'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          انصراف
        </button>
      </div>
    </form>
  );
}
