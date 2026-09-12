'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { MenuItemCostResult } from '@/lib/engine/types';
import { formatCurrency, formatPercent, faDigits } from '@/lib/format';
import { CostBar } from '@/components/CostBar';
import { NumberField, PercentField, SelectField, Delta } from './fields';

/**
 * COST BUILDER
 *
 * One screen holding every input that decides what a dish costs: ingredient
 * prices, the recipe quantities, labour minutes, and the profile's labour,
 * overhead and pricing rules. Change any of them and the whole breakdown
 * recalculates.
 *
 * The recalculation happens on the SERVER, against the real cost engine, not
 * in this component. Doing the arithmetic here would be faster to type against
 * but would mean two implementations of the costing rules, and the figure a
 * manager approves would not be the figure that gets stored. Instead the draft
 * is posted to /api/costing/simulate, which runs the same code the save path
 * runs and returns the same shape.
 *
 * Requests are debounced and superseded: only the newest response is applied,
 * so a slow earlier request cannot overwrite a newer number.
 */

export interface BuilderLine {
  id: string;
  kind: 'INGREDIENT' | 'SUB_RECIPE';
  refId: string;
  name: string;
  quantity: string;
  unitCode: string;
  unitId: string;
  /** Purchase-unit price, editable for ingredient lines. */
  purchasePrice: string | null;
  purchaseUnitCode: string | null;
  yieldPercent: string | null;
  isPackaging: boolean;
}

export interface BuilderProfile {
  id: string;
  name: string;
  laborMethod: string;
  laborCostPerMinute: string;
  laborPercentOfRevenue: string;
  overheadMethod: string;
  monthlyOverheadCost: string;
  expectedMonthlyUnits: number;
  overheadPercentOfRevenue: string;
  overheadPercentOfFoodCost: string;
  pricingStrategy: string;
  targetGrossMargin: string;
  targetFoodCostPct: string;
  markupMultiplier: string;
  minimumMargin: string;
  roundingRule: string;
  taxRate: string;
  wasteBufferPct: string;
}

const LABOR_METHODS: Array<[string, string]> = [
  ['PER_MINUTE', 'بر پایه دقیقه کار'],
  ['PERCENT_OF_REVENUE', 'درصدی از فروش'],
  ['PER_UNIT', 'تقسیم بر پرس ماهانه'],
  ['NONE', 'محاسبه نشود'],
];
const OVERHEAD_METHODS: Array<[string, string]> = [
  ['PER_UNIT', 'تقسیم بر پرس ماهانه'],
  ['PERCENT_OF_REVENUE', 'درصدی از فروش'],
  ['PERCENT_OF_FOOD_COST', 'درصدی از مواد اولیه'],
  ['PER_LABOR_MINUTE', 'بر پایه دقیقه کار'],
  ['NONE', 'محاسبه نشود'],
];
const STRATEGIES: Array<[string, string]> = [
  ['TARGET_GROSS_MARGIN', 'هدف حاشیه سود'],
  ['TARGET_FOOD_COST', 'هدف درصد مواد اولیه'],
  ['COST_PLUS_MARKUP', 'ضریب روی تمام‌شده'],
  ['FIXED_PROFIT', 'سود ثابت'],
];
const ROUNDING: Array<[string, string]> = [
  ['NONE', 'بدون گرد کردن'],
  ['NEAREST_1000', 'گرد به ۱٬۰۰۰'],
  ['NEAREST_5000', 'گرد به ۵٬۰۰۰'],
  ['NEAREST_10000', 'گرد به ۱۰٬۰۰۰'],
];

export function CostBuilder({
  menuItemId, initial, lines, profile, symbol, laborMinutes, sellingPrice, canEditRecipe, canEditProfile,
}: {
  menuItemId: string;
  initial: MenuItemCostResult;
  lines: BuilderLine[];
  profile: BuilderProfile;
  symbol: string;
  laborMinutes: number;
  sellingPrice: string;
  canEditRecipe: boolean;
  canEditProfile: boolean;
}) {
  const router = useRouter();

  // Draft state — what the manager has typed but not saved.
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [yields, setYields] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [profileDraft, setProfileDraft] = useState<Partial<BuilderProfile>>({});
  const [price, setPrice] = useState(String(Math.round(Number(sellingPrice))));
  const [minutes, setMinutes] = useState(String(laborMinutes));

  const [result, setResult] = useState<MenuItemCostResult>(initial);
  const [baseline] = useState<MenuItemCostResult>(initial);
  const [status, setStatus] = useState<'idle' | 'calculating' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const requestId = useRef(0);

  const isDirty =
    Object.keys(prices).length > 0 ||
    Object.keys(yields).length > 0 ||
    Object.keys(quantities).length > 0 ||
    removed.length > 0 ||
    Object.keys(profileDraft).length > 0 ||
    minutes !== String(laborMinutes) ||
    price !== String(Math.round(Number(sellingPrice)));

  const simulate = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('calculating');
    setMessage(null);

    try {
      const response = await fetch('/api/costing/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId,
          ingredientPrices: prices,
          ingredientYields: yields,
          lineQuantities: quantities,
          removedLineIds: removed,
          profile: profileDraft,
          sellingPrice: price === '' ? null : price,
          laborMinutes: minutes === '' ? null : Number(minutes),
        }),
      });

      // A response from a superseded request must not overwrite a newer one.
      if (id !== requestId.current) return;

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus('error');
        setMessage(body.error ?? 'محاسبه انجام نشد');
        return;
      }
      setResult(body.draft);
      setStatus('idle');
    } catch {
      if (id !== requestId.current) return;
      setStatus('error');
      setMessage('ارتباط با سرور برقرار نشد');
    }
  }, [menuItemId, prices, yields, quantities, removed, profileDraft, price, minutes]);

  // Debounced so typing a four-digit price fires one request, not four.
  useEffect(() => {
    const timer = setTimeout(simulate, 350);
    return () => clearTimeout(timer);
  }, [simulate]);

  async function saveAll() {
    setSaving(true);
    setSaved(null);
    setMessage(null);

    try {
      const requests: Array<Promise<Response>> = [];

      for (const [ingredientId, value] of Object.entries(prices)) {
        requests.push(patch(`/api/ingredients/${ingredientId}`, { lastPurchasePrice: value }));
      }
      for (const [ingredientId, value] of Object.entries(yields)) {
        requests.push(patch(`/api/ingredients/${ingredientId}`, { yieldPercent: value }));
      }
      if (Object.keys(profileDraft).length > 0) {
        requests.push(patch(`/api/costing-profiles/${profile.id}`, normaliseProfile(profileDraft)));
      }
      if (price !== String(Math.round(Number(sellingPrice)))) {
        requests.push(patch(`/api/menu-items/${menuItemId}/price`, {
          sellingPrice: Number(price), priceIsOverridden: true,
        }));
      }

      const responses = await Promise.all(requests);
      const failed = responses.find((r) => !r.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        setMessage(body.error ?? 'بخشی از تغییرات ذخیره نشد');
        setSaving(false);
        return;
      }

      setSaved('تغییرات ذخیره شد.');
      setPrices({}); setYields({}); setProfileDraft({});
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setPrices({}); setYields({}); setQuantities({}); setRemoved([]);
    setProfileDraft({});
    setPrice(String(Math.round(Number(sellingPrice))));
    setMinutes(String(laborMinutes));
  }

  const money = (v: string | number) => formatCurrency(v, { symbol: '', compact: false });
  const pct = (v: string | number) => formatPercent(v);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ── Inputs ─────────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-4">
        {/* Ingredients */}
        <section className="card p-4">
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-ink-800">مواد اولیه و مقادیر</h2>
            <p className="mt-0.5 text-2xs text-ink-600">
              قیمت خرید هر ماده و مقدار مصرفی در این غذا. با هر تغییر، قیمت تمام‌شده دوباره حساب می‌شود.
            </p>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-ink-200">
                  <th className="th">جزء</th>
                  <th className="th">مقدار</th>
                  <th className="th">قیمت خرید</th>
                  <th className="th">بازده</th>
                  <th className="th whitespace-nowrap">هزینه</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {lines.map((line) => {
                  const isRemoved = removed.includes(line.id);
                  const costed = result.lines.find((l) => l.refId === line.refId);

                  return (
                    <tr key={line.id} className={isRemoved ? 'opacity-40' : ''}>
                      <td className="td">
                        {line.name}
                        {line.kind === 'SUB_RECIPE' && (
                          <span className="mr-2 rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-600">
                            دستور میانی
                          </span>
                        )}
                        {line.isPackaging && (
                          <span className="mr-2 rounded bg-ink-200 px-1.5 py-0.5 text-2xs text-ink-600">
                            بسته‌بندی
                          </span>
                        )}
                      </td>

                      <td className="td">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" inputMode="decimal" step="any" min={0} dir="ltr"
                            disabled={isRemoved || !canEditRecipe}
                            aria-label={`مقدار ${line.name}`}
                            value={quantities[line.id] ?? line.quantity}
                            onChange={(e) =>
                              setQuantities((q) => ({ ...q, [line.id]: e.target.value }))}
                            className="tabular h-10 w-20 rounded-lg border border-ink-300 bg-ink-100
                                       px-2 text-left text-2xs text-ink-900 focus:border-forest-500
                                       focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none disabled:opacity-50"
                          />
                          <span className="text-2xs text-ink-600">{line.unitCode}</span>
                        </div>
                      </td>

                      <td className="td">
                        {line.purchasePrice !== null ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" inputMode="decimal" step="1000" min={0} dir="ltr"
                              disabled={isRemoved}
                              aria-label={`قیمت خرید ${line.name}`}
                              value={prices[line.refId] ?? String(Math.round(Number(line.purchasePrice)))}
                              onChange={(e) =>
                                setPrices((p) => ({ ...p, [line.refId]: e.target.value }))}
                              className="tabular h-10 w-28 rounded-lg border border-ink-300 bg-ink-100
                                         px-2 text-left text-2xs text-ink-900 focus:border-forest-500
                                         focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none disabled:opacity-50"
                            />
                            <span className="text-2xs text-ink-400">/{line.purchaseUnitCode}</span>
                          </div>
                        ) : (
                          <span className="text-2xs text-ink-400">—</span>
                        )}
                      </td>

                      <td className="td">
                        {line.yieldPercent !== null ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number" inputMode="decimal" step="1" min={1} max={100} dir="ltr"
                              disabled={isRemoved}
                              aria-label={`بازده ${line.name}`}
                              value={Math.round(Number(yields[line.refId] ?? line.yieldPercent) * 100)}
                              onChange={(e) =>
                                setYields((y) => ({
                                  ...y, [line.refId]: String(Number(e.target.value) / 100),
                                }))}
                              className="tabular h-10 w-14 rounded-lg border border-ink-300 bg-ink-100
                                         px-2 text-left text-2xs text-ink-900 focus:border-forest-500
                                         focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-0 focus:outline-none disabled:opacity-50"
                            />
                            <span className="text-2xs text-ink-400">٪</span>
                          </div>
                        ) : (
                          <span className="text-2xs text-ink-400">—</span>
                        )}
                      </td>

                      <td className="td tabular text-ink-800">
                        {costed && !isRemoved ? formatCurrency(costed.totalCost) : '—'}
                      </td>

                      <td className="td">
                        {canEditRecipe && (
                          <button
                            onClick={() =>
                              setRemoved((r) =>
                                isRemoved ? r.filter((x) => x !== line.id) : [...r, line.id])}
                            aria-label={
                              isRemoved
                                ? `برگرداندن ${line.name} به محاسبه`
                                : `حذف موقت ${line.name} از محاسبه`
                            }
                            title={isRemoved ? 'برگرداندن' : 'حذف موقت از محاسبه'}
                            className="grid size-9 place-items-center rounded-lg text-ink-600
                                       transition-colors hover:bg-ink-200 hover:text-ink-700"
                          >
                            {isRemoved ? '↺' : '×'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {removed.length > 0 && (
            <p className="mt-3 rounded-lg border border-ink-300 bg-ink-100 px-3 py-2 text-2xs leading-5 text-ink-600">
              «حذف موقت» فقط برای دیدن اثر روی قیمت است و ذخیره نمی‌شود. برای حذف دائمی،
              دستور پخت را در صفحه دستور پخت ویرایش کنید.
            </p>
          )}
        </section>

        {/* Labour & price */}
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">نیروی کار و قیمت فروش</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField
              label="زمان کل آماده‌سازی و پخت"
              value={minutes}
              onChange={setMinutes}
              suffix="دقیقه"
              step="1"
              hint={`نرخ فعلی: ${formatCurrency(profileDraft.laborCostPerMinute ?? profile.laborCostPerMinute, { symbol })} برای هر دقیقه`}
            />
            <NumberField
              label="قیمت فروش"
              value={price}
              onChange={setPrice}
              suffix={symbol}
              step="5000"
              hint={
                <>پیشنهاد موتور: {formatCurrency(result.recommendedPrice, { symbol })}{' '}
                  <button
                    type="button"
                    onClick={() => setPrice(String(Math.round(Number(result.recommendedPrice))))}
                    className="text-forest-500 underline hover:text-forest-400"
                  >
                    اعمال کن
                  </button>
                </>
              }
            />
          </div>
        </section>

        {/* Profile */}
        <section className="card p-4">
          <header className="mb-3">
            <h2 className="text-sm font-semibold text-ink-800">
              قواعد محاسبه — پروفایل «{profile.name}»
            </h2>
            <p className="mt-0.5 text-2xs leading-5 text-ink-600">
              این تنظیمات روی <strong className="text-forest-500">همه</strong> آیتم‌هایی که از
              این پروفایل استفاده می‌کنند اثر می‌گذارد، نه فقط این غذا.
            </p>
          </header>

          <fieldset disabled={!canEditProfile} className="space-y-4 disabled:opacity-60">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField
                label="روش محاسبه نیروی کار"
                value={profileDraft.laborMethod ?? profile.laborMethod}
                onChange={(v) => setProfileDraft((p) => ({ ...p, laborMethod: v }))}
                options={LABOR_METHODS}
              />
              {(profileDraft.laborMethod ?? profile.laborMethod) === 'PER_MINUTE' && (
                <NumberField
                  label="هزینه هر دقیقه کار"
                  value={profileDraft.laborCostPerMinute ?? String(Math.round(Number(profile.laborCostPerMinute)))}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, laborCostPerMinute: v }))}
                  suffix={symbol}
                  step="100"
                  hint="از صفحه کارکنان: مجموع حقوق ماهانه ÷ ساعت کار ÷ ۶۰"
                />
              )}
              {(profileDraft.laborMethod ?? profile.laborMethod) === 'PERCENT_OF_REVENUE' && (
                <PercentField
                  label="سهم نیروی کار از فروش"
                  value={profileDraft.laborPercentOfRevenue ?? profile.laborPercentOfRevenue}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, laborPercentOfRevenue: v }))}
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField
                label="روش تخصیص سربار"
                value={profileDraft.overheadMethod ?? profile.overheadMethod}
                onChange={(v) => setProfileDraft((p) => ({ ...p, overheadMethod: v }))}
                options={OVERHEAD_METHODS}
              />
              {(profileDraft.overheadMethod ?? profile.overheadMethod) === 'PER_UNIT' && (
                <>
                  <NumberField
                    label="سربار ماهانه"
                    value={profileDraft.monthlyOverheadCost ?? String(Math.round(Number(profile.monthlyOverheadCost)))}
                    onChange={(v) => setProfileDraft((p) => ({ ...p, monthlyOverheadCost: v }))}
                    suffix={symbol}
                    step="1000000"
                    hint="اجاره، برق، گاز، بیمه و بقیه هزینه‌های ثابت"
                  />
                  <NumberField
                    label="تعداد پرس مورد انتظار در ماه"
                    value={String(profileDraft.expectedMonthlyUnits ?? profile.expectedMonthlyUnits)}
                    onChange={(v) => setProfileDraft((p) => ({ ...p, expectedMonthlyUnits: Number(v) || 1 }))}
                    step="100"
                    min={1}
                    hint="سربار بر این عدد تقسیم می‌شود"
                  />
                </>
              )}
              {(profileDraft.overheadMethod ?? profile.overheadMethod) === 'PERCENT_OF_REVENUE' && (
                <PercentField
                  label="سهم سربار از فروش"
                  value={profileDraft.overheadPercentOfRevenue ?? profile.overheadPercentOfRevenue}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, overheadPercentOfRevenue: v }))}
                />
              )}
              {(profileDraft.overheadMethod ?? profile.overheadMethod) === 'PERCENT_OF_FOOD_COST' && (
                <PercentField
                  label="سهم سربار از مواد اولیه"
                  value={profileDraft.overheadPercentOfFoodCost ?? profile.overheadPercentOfFoodCost}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, overheadPercentOfFoodCost: v }))}
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="راهبرد قیمت‌گذاری"
                value={profileDraft.pricingStrategy ?? profile.pricingStrategy}
                onChange={(v) => setProfileDraft((p) => ({ ...p, pricingStrategy: v }))}
                options={STRATEGIES}
              />
              {(profileDraft.pricingStrategy ?? profile.pricingStrategy) === 'TARGET_GROSS_MARGIN' && (
                <PercentField
                  label="هدف حاشیه سود"
                  value={profileDraft.targetGrossMargin ?? profile.targetGrossMargin}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, targetGrossMargin: v }))}
                  hint="قیمت = تمام‌شده ÷ (۱ − حاشیه)"
                />
              )}
              {(profileDraft.pricingStrategy ?? profile.pricingStrategy) === 'TARGET_FOOD_COST' && (
                <PercentField
                  label="هدف درصد مواد اولیه"
                  value={profileDraft.targetFoodCostPct ?? profile.targetFoodCostPct}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, targetFoodCostPct: v }))}
                />
              )}
              {(profileDraft.pricingStrategy ?? profile.pricingStrategy) === 'COST_PLUS_MARKUP' && (
                <NumberField
                  label="ضریب روی قیمت تمام‌شده"
                  value={profileDraft.markupMultiplier ?? profile.markupMultiplier}
                  onChange={(v) => setProfileDraft((p) => ({ ...p, markupMultiplier: v }))}
                  step="0.1"
                />
              )}
              <PercentField
                label="حداقل حاشیه قابل قبول"
                value={profileDraft.minimumMargin ?? profile.minimumMargin}
                onChange={(v) => setProfileDraft((p) => ({ ...p, minimumMargin: v }))}
                hint="زیر این عدد، آیتم هشدار می‌گیرد"
              />
              <SelectField
                label="گرد کردن قیمت"
                value={profileDraft.roundingRule ?? profile.roundingRule}
                onChange={(v) => setProfileDraft((p) => ({ ...p, roundingRule: v }))}
                options={ROUNDING}
                hint="همیشه به بالا"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <PercentField
                label="مالیات بر ارزش افزوده"
                value={profileDraft.taxRate ?? profile.taxRate}
                onChange={(v) => setProfileDraft((p) => ({ ...p, taxRate: v }))}
              />
              <PercentField
                label="ضریب ضایعات عمومی"
                value={profileDraft.wasteBufferPct ?? profile.wasteBufferPct}
                onChange={(v) => setProfileDraft((p) => ({ ...p, wasteBufferPct: v }))}
                hint="روی افت هر ماده، اضافه می‌شود"
              />
            </div>
          </fieldset>

          {!canEditProfile && (
            <p className="mt-3 text-2xs text-ink-600">
              برای تغییر این تنظیمات به دسترسی «پیکربندی قیمت‌گذاری» نیاز دارید.
            </p>
          )}
        </section>
      </div>

      {/* ── Live result ────────────────────────────────────────────────── */}
      <aside className="xl:sticky xl:top-20 xl:self-start">
        <div className="card overflow-hidden">
          <div className="border-b border-ink-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-800">نتیجه محاسبه</h2>
              <span
                aria-live="polite"
                className={`text-2xs ${
                  status === 'calculating' ? 'text-forest-500'
                    : status === 'error' ? 'text-pomegranate-400' : 'text-ink-400'
                }`}
              >
                {status === 'calculating' ? 'در حال محاسبه…'
                  : status === 'error' ? 'خطا' : isDirty ? 'پیش‌نمایش' : 'ذخیره‌شده'}
              </span>
            </div>

            {message && (
              <p role="alert" className="mt-2 rounded-lg border border-pomegranate-500/30 bg-pomegranate-500/10 px-2.5 py-2 text-2xs leading-5 text-pomegranate-400">
                {message}
              </p>
            )}
          </div>

          <div className="p-4">
            <p className="label">قیمت تمام‌شده هر پرس</p>
            <p className="mt-1 text-2xl font-bold">
              <Delta from={baseline.totalCost} to={result.totalCost} format={money} invert />
              <span className="mr-1.5 text-sm font-normal text-ink-600">{symbol}</span>
            </p>

            <div className="mt-4">
              <CostBar
                ingredientCost={result.ingredientCost}
                subRecipeCost={result.subRecipeCost}
                laborCost={result.laborCost}
                packagingCost={result.packagingCost}
                overheadCost={result.overheadCost}
                sellingPrice={result.sellingPrice}
                symbol={symbol}
                height="h-3"
              />
            </div>

            <dl className="mt-4 space-y-2 border-t border-ink-200 pt-3">
              <Row label="مواد اولیه" from={baseline.ingredientCost} to={result.ingredientCost} format={money} invert />
              <Row label="دستورهای میانی" from={baseline.subRecipeCost} to={result.subRecipeCost} format={money} invert />
              <Row label="بسته‌بندی" from={baseline.packagingCost} to={result.packagingCost} format={money} invert />
              <Row label="نیروی کار" from={baseline.laborCost} to={result.laborCost} format={money} invert />
              <Row label="سربار" from={baseline.overheadCost} to={result.overheadCost} format={money} invert />
            </dl>

            <dl className="mt-3 space-y-2 border-t border-ink-200 pt-3">
              <Row label="قیمت فروش" from={baseline.sellingPrice} to={result.sellingPrice} format={money} />
              <Row label="سود ناخالص" from={baseline.grossProfit} to={result.grossProfit} format={money} />
              <Row label="حاشیه سود" from={baseline.grossMarginPct} to={result.grossMarginPct} format={pct} />
              <Row label="درصد مواد اولیه" from={baseline.foodCostPct} to={result.foodCostPct} format={pct} invert />
              <Row label="قیمت پیشنهادی" from={baseline.recommendedPrice} to={result.recommendedPrice} format={money} />
            </dl>

            {result.isUnprofitable ? (
              <p className="mt-3 rounded-lg border border-pomegranate-500/30 bg-pomegranate-500/10 px-3 py-2 text-2xs leading-5 text-pomegranate-400">
                با این تنظیمات، هر پرس {formatCurrency(Math.abs(Number(result.grossProfit)), { symbol })} زیان می‌دهد.
              </p>
            ) : result.isBelowMinimumMargin ? (
              <p className="mt-3 rounded-lg border border-forest-500/30 bg-forest-500/10 px-3 py-2 text-2xs leading-5 text-forest-400">
                حاشیه سود از حداقل تعیین‌شده کمتر است. قیمت پیشنهادی:{' '}
                {formatCurrency(result.recommendedPrice, { symbol })}.
              </p>
            ) : null}
          </div>

          <div className="border-t border-ink-200 p-4">
            <button
              onClick={saveAll}
              disabled={!isDirty || saving || status === 'error'}
              className="btn-primary w-full"
            >
              {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
            </button>
            {isDirty && (
              <button onClick={reset} className="btn-ghost mt-2 w-full">
                برگرداندن به مقادیر ذخیره‌شده
              </button>
            )}
            {saved && (
              <p role="status" className="mt-2 text-center text-2xs text-pistachio-400">{saved}</p>
            )}
            <p className="mt-3 text-2xs leading-5 text-ink-400">
              مقدارهای دستور پخت اینجا فقط برای پیش‌نمایش‌اند؛ قیمت مواد اولیه،
              تنظیمات پروفایل و قیمت فروش ذخیره می‌شوند.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({
  label, from, to, format, invert,
}: {
  label: string;
  from: string;
  to: string;
  format: (v: string | number) => string;
  invert?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-2xs text-ink-600">{label}</dt>
      <dd className="text-sm"><Delta from={from} to={to} format={format} invert={invert} /></dd>
    </div>
  );
}

function patch(url: string, body: unknown) {
  return fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Numbers go to the API as strings; expectedMonthlyUnits stays an integer. */
function normaliseProfile(draft: Partial<BuilderProfile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value === undefined || value === '') continue;
    out[key] = key === 'expectedMonthlyUnits' ? Number(value) : String(value);
  }
  return out;
}
