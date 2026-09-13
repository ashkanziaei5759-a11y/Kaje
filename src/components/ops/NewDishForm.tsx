'use client';

import { useMemo, useState } from 'react';
import { RecordForm } from './RecordForm';
import { SelectField, NumberField, TextField, TextAreaField } from '@/components/cost/fields';
import { faDigits } from '@/lib/format';

export interface DishIngredient {
  id: string;
  label: string;
  unit: string;
  /** Cost per recipe unit, already adjusted for yield. */
  costPerUnit: string;
}

interface Line {
  key: number;
  ingredientId: string;
  quantity: string;
}

let nextKey = 1;
const blank = (): Line => ({ key: nextKey++, ingredientId: '', quantity: '' });

export function NewDishForm({
  categories,
  ingredients,
  currency,
}: {
  categories: { id: string; label: string }[];
  ingredients: DishIngredient[];
  currency: string;
}) {
  const [namePersian, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [prepTimeMinutes, setPrep] = useState('0');
  const [cookTimeMinutes, setCook] = useState('0');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [resetKey, setResetKey] = useState(0);

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const filled = lines.filter((l) => l.ingredientId && l.quantity);

  // Ingredients only — an estimate, shown while typing. The authoritative
  // figure comes back from the engine on save, with labour, packaging and
  // overhead included, which is why this is labelled as materials alone.
  const materials = filled.reduce(
    (sum, l) => sum + Number(byId.get(l.ingredientId)?.costPerUnit ?? 0) * Number(l.quantity),
    0,
  );

  return (
    <RecordForm
      key={resetKey}
      title="افزودن غذای جدید به منو"
      explain={
        <>
          بگویید این غذا از چه موادی و چه مقدار از هرکدام درست می‌شود. سیستم
          خودش <b>قیمت تمام‌شده</b> را حساب می‌کند — مواد، دستمزد، بسته‌بندی و سربار —
          و <b>قیمت فروش پیشنهادی</b> می‌دهد. عمداً قیمت فروش را همین‌جا نمی‌گیریم:
          اول ببینید چقدر تمام می‌شود، بعد در صفحهٔ قیمت تمام‌شده تصمیم بگیرید.
        </>
      }
      submitLabel="ساختن غذا و محاسبهٔ قیمت تمام‌شده"
      endpoint="/api/dishes"
      buildBody={() => {
        if (!namePersian.trim()) return { ok: false, error: 'نام غذا را وارد کنید.' };
        if (!categoryId) return { ok: false, error: 'دستهٔ منو را انتخاب کنید.' };
        if (filled.length === 0) {
          return { ok: false, error: 'حداقل یک ماده اولیه با مقدار وارد کنید.' };
        }
        return {
          ok: true,
          body: {
            namePersian: namePersian.trim(),
            categoryId,
            description: description || null,
            prepTimeMinutes: Number(prepTimeMinutes) || 0,
            cookTimeMinutes: Number(cookTimeMinutes) || 0,
            lines: filled.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
          },
        };
      }}
      describeSuccess={(r: { totalCost: string; recommendedPrice: string }) =>
        `غذا ساخته شد. قیمت تمام‌شده: ${faDigits(
          Math.round(Number(r.totalCost)).toLocaleString('en-US'),
        )} ${currency} — قیمت فروش پیشنهادی: ${faDigits(
          Math.round(Number(r.recommendedPrice)).toLocaleString('en-US'),
        )} ${currency}. برای تعیین قیمت نهایی به صفحهٔ همان غذا بروید.`
      }
      onSuccess={() => {
        setName('');
        setDescription('');
        setLines([blank()]);
        setResetKey((k) => k + 1);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="نام غذا"
          value={namePersian}
          onChange={setName}
          hint="همان نامی که روی منو می‌آید."
          required
        />
        <SelectField
          label="دستهٔ منو"
          value={categoryId}
          onChange={setCategoryId}
          hint="پیش‌غذا، غذای اصلی، نوشیدنی…"
          options={[
            ['', 'انتخاب کنید…'],
            ...categories.map((c) => [c.id, c.label] as [string, string]),
          ]}
        />
      </div>

      <TextAreaField
        label="توضیح روی منو"
        value={description}
        onChange={setDescription}
        hint="اختیاری — چیزی که مهمان روی منوی دیجیتال می‌خواند."
      />

      <div>
        <p className="label mb-2">مواد این غذا</p>
        <p className="mb-3 text-2xs leading-6 text-ink-600">
          برای <b>یک پرس</b> چقدر از هر ماده مصرف می‌شود؟ واحد هرکدام کنارش نوشته
          شده — معمولاً گرم یا میلی‌لیتر. اگر مطمئن نیستید، یک بار با ترازو وزن کنید؛
          دقت همین عدد است که دقت قیمت تمام‌شده را می‌سازد.
        </p>

        <div className="space-y-3">
          {lines.map((line, index) => {
            const chosen = byId.get(line.ingredientId);
            const lineCost = chosen ? Number(chosen.costPerUnit) * Number(line.quantity || 0) : 0;
            return (
              <div key={line.key} className="card-inset p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-start">
                  <SelectField
                    label={`ماده ${faDigits(index + 1)}`}
                    value={line.ingredientId}
                    onChange={(v) =>
                      setLines((prev) =>
                        prev.map((l) => (l.key === line.key ? { ...l, ingredientId: v } : l)),
                      )
                    }
                    options={[
                      ['', 'ماده اولیه…'],
                      ...ingredients.map((i) => [i.id, i.label] as [string, string]),
                    ]}
                  />
                  <NumberField
                    label="مقدار در یک پرس"
                    value={line.quantity}
                    onChange={(v) =>
                      setLines((prev) =>
                        prev.map((l) => (l.key === line.key ? { ...l, quantity: v } : l)),
                      )
                    }
                    suffix={chosen?.unit}
                    hint={chosen ? `به ${chosen.unit}` : undefined}
                  />
                  <div className="flex items-end sm:pt-6">
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="btn-ghost min-h-11 px-3 text-2xs"
                        onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                        aria-label={`حذف ماده ${faDigits(index + 1)}`}
                      >
                        حذف
                      </button>
                    ) : null}
                  </div>
                </div>
                {lineCost > 0 ? (
                  <p className="mt-2 text-2xs text-ink-600">
                    هزینهٔ این ماده در هر پرس:{' '}
                    <span className="tabular font-medium text-ink-800">
                      {faDigits(Math.round(lineCost).toLocaleString('en-US'))} {currency}
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
          + افزودن ماده دیگر
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="زمان آماده‌سازی"
          value={prepTimeMinutes}
          onChange={setPrep}
          suffix="دقیقه"
          hint="برای حساب کردن سهم دستمزد آشپز."
        />
        <NumberField
          label="زمان پخت"
          value={cookTimeMinutes}
          onChange={setCook}
          suffix="دقیقه"
          hint="اگر پخت بدون حضور آشپز است، صفر بگذارید."
        />
      </div>

      {materials > 0 ? (
        <div className="rounded-xl border border-azure-500/30 bg-azure-300/10 px-4 py-3">
          <p className="text-2xs text-ink-700">هزینهٔ مواد در هر پرس (تخمینی)</p>
          <p className="tabular mt-0.5 text-xl font-bold text-azure-700">
            {faDigits(Math.round(materials).toLocaleString('en-US'))} {currency}
          </p>
          <p className="mt-1 text-2xs leading-5 text-ink-600">
            فقط مواد. دستمزد، بسته‌بندی و سربار بعد از ثبت به آن اضافه می‌شود و
            عدد نهایی را همان موقع نشان می‌دهیم.
          </p>
        </div>
      ) : null}
    </RecordForm>
  );
}
