'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/format';

/**
 * Inline price and yield editing on the ingredients table.
 *
 * Edits are collected across rows and saved together, because updating
 * ingredient prices is something a manager does in a batch after a delivery,
 * not one row at a time. Nothing is written until "Save" — so a mistyped digit
 * mid-edit never reaches the costing engine.
 *
 * Each row shows what its change does to the cost per recipe unit, since that
 * — not the purchase price — is the number that flows into every dish.
 */

export interface EditableIngredient {
  id: string;
  name: string;
  purchaseUnit: string;
  recipeUnit: string;
  conversionFactor: string;
  price: string;
  yieldPercent: string;
}

export function IngredientPriceEditor({
  ingredients, symbol, canEdit,
}: {
  ingredients: EditableIngredient[];
  symbol: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, { price?: string; yieldPercent?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const changedIds = Object.keys(drafts).filter((id) => {
    const original = ingredients.find((i) => i.id === id);
    if (!original) return false;
    const draft = drafts[id];
    return (
      (draft.price !== undefined && draft.price !== round(original.price)) ||
      (draft.yieldPercent !== undefined && draft.yieldPercent !== pctOf(original.yieldPercent))
    );
  });

  function set(id: string, patch: { price?: string; yieldPercent?: string }) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
    setFieldErrors((e) => { const { [id]: _drop, ...rest } = e; return rest; });
    setMessage(null);
  }

  /** Cost of one recipe unit, adjusted for yield — what recipes actually pay. */
  function effectiveUnitCost(ingredient: EditableIngredient): number {
    const draft = drafts[ingredient.id] ?? {};
    const price = Number(draft.price ?? round(ingredient.price));
    const yieldPct = Number(draft.yieldPercent ?? pctOf(ingredient.yieldPercent)) / 100;
    const factor = Number(ingredient.conversionFactor);
    if (!factor || !yieldPct) return 0;
    return price / factor / yieldPct;
  }

  async function saveAll() {
    setSaving(true);
    setMessage(null);
    const errors: Record<string, string> = {};

    for (const id of changedIds) {
      const draft = drafts[id];
      const body: Record<string, string> = {};
      if (draft.price !== undefined) body.lastPurchasePrice = String(Number(draft.price));
      if (draft.yieldPercent !== undefined) {
        body.yieldPercent = String(Number(draft.yieldPercent) / 100);
      }

      const response = await fetch(`/api/ingredients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        errors[id] = payload.error ?? 'ذخیره نشد';
      }
    }

    setSaving(false);
    setFieldErrors(errors);

    const failed = Object.keys(errors).length;
    if (failed > 0) {
      setMessage({
        tone: 'error',
        text: `${failed.toLocaleString('fa-IR')} مورد ذخیره نشد. پیام خطا کنار همان ردیف است.`,
      });
      return;
    }

    setMessage({
      tone: 'ok',
      text: `${changedIds.length.toLocaleString('fa-IR')} ماده اولیه به‌روز شد. قیمت تمام‌شده غذاهای وابسته دوباره حساب می‌شود.`,
    });
    setDrafts({});
    router.refresh();
  }

  return (
    <div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-ink-200">
              <th className="th">ماده اولیه</th>
              <th className="th">قیمت خرید</th>
              <th className="th">بازده</th>
              <th className="th">هزینه هر واحد مصرف</th>
              <th className="th">اثر</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {ingredients.map((ingredient) => {
              const draft = drafts[ingredient.id] ?? {};
              const originalCost =
                Number(ingredient.price) / Number(ingredient.conversionFactor) /
                Number(ingredient.yieldPercent);
              const nextCost = effectiveUnitCost(ingredient);
              const delta = nextCost - originalCost;
              const error = fieldErrors[ingredient.id];

              return (
                <tr key={ingredient.id} className={error ? 'bg-pomegranate-500/5' : ''}>
                  <td className="td">
                    {ingredient.name}
                    {error && (
                      <p className="mt-1 text-2xs text-pomegranate-400">{error}</p>
                    )}
                  </td>

                  <td className="td">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" inputMode="decimal" step="1000" min={0} dir="ltr"
                        disabled={!canEdit}
                        aria-label={`قیمت خرید ${ingredient.name}`}
                        aria-invalid={error ? true : undefined}
                        value={draft.price ?? round(ingredient.price)}
                        onChange={(e) => set(ingredient.id, { price: e.target.value })}
                        className="tabular h-10 w-32 rounded-lg border border-ink-300 bg-ink-100
                                   px-2 text-left text-2xs text-ink-900 focus:border-forest-500
                                   focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none disabled:opacity-50"
                      />
                      <span className="text-2xs text-ink-400">/{ingredient.purchaseUnit}</span>
                    </div>
                  </td>

                  <td className="td">
                    <div className="flex items-center gap-1">
                      <input
                        type="number" inputMode="decimal" step="1" min={1} max={100} dir="ltr"
                        disabled={!canEdit}
                        aria-label={`بازده ${ingredient.name}`}
                        value={draft.yieldPercent ?? pctOf(ingredient.yieldPercent)}
                        onChange={(e) => set(ingredient.id, { yieldPercent: e.target.value })}
                        className="tabular h-10 w-16 rounded-lg border border-ink-300 bg-ink-100
                                   px-2 text-left text-2xs text-ink-900 focus:border-forest-500
                                   focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none disabled:opacity-50"
                      />
                      <span className="text-2xs text-ink-400">٪</span>
                    </div>
                  </td>

                  <td className="td tabular text-ink-800">
                    {formatCurrency(nextCost, { decimals: 2 })}
                    <span className="mr-1 text-2xs text-ink-400">/{ingredient.recipeUnit}</span>
                  </td>

                  <td className="td">
                    {Math.abs(delta) < 0.001 ? (
                      <span className="text-2xs text-ink-300">—</span>
                    ) : (
                      <span
                        className={`tabular text-2xs ${
                          delta > 0 ? 'text-pomegranate-400' : 'text-pistachio-400'
                        }`}
                      >
                        {delta > 0 ? '+' : ''}
                        {formatPercent(delta / originalCost, { decimals: 1 })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div
          className={`mt-3 flex flex-wrap items-center gap-3 transition-opacity ${
            changedIds.length > 0 ? 'opacity-100' : 'opacity-60'
          }`}
        >
          <button onClick={saveAll} disabled={changedIds.length === 0 || saving} className="btn-primary">
            {saving
              ? 'در حال ذخیره…'
              : `ذخیره ${changedIds.length > 0 ? changedIds.length.toLocaleString('fa-IR') + ' تغییر' : 'تغییرات'}`}
          </button>
          {changedIds.length > 0 && (
            <button onClick={() => { setDrafts({}); setFieldErrors({}); setMessage(null); }} className="btn-ghost">
              انصراف
            </button>
          )}
          {message && (
            <p
              role="status"
              className={`text-2xs ${message.tone === 'ok' ? 'text-pistachio-400' : 'text-pomegranate-400'}`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-2xs leading-6 text-ink-600">
        تغییر قیمت اینجا در تاریخچه قیمت ثبت می‌شود و میانگین موزون را هم به‌روز می‌کند —
        وگرنه صفحه یک عدد نشان می‌داد و موتور با عدد قدیمی محاسبه می‌کرد.
      </p>
    </div>
  );
}

const round = (v: string) => String(Math.round(Number(v)));
const pctOf = (v: string) => String(Math.round(Number(v) * 100));
