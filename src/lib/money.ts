/**
 * Decimal-safe money & quantity primitives.
 *
 * RULE: no financial value in this codebase is ever a JavaScript `number`.
 * Floats cannot represent 0.1 exactly, and a rounding drift of one rial per
 * line compounds into a wrong P&L. Everything goes through Decimal.js with a
 * fixed precision, and only crosses into `number` at the presentation edge.
 */
import { Decimal } from 'decimal.js';

// 28 significant digits is far more than Decimal(18,4) needs, so intermediate
// products (qty × unitCost × yield) never lose precision before we round.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Anything we can safely build a Decimal from. */
export type Numeric = Decimal | string | number | { toString(): string };

/** Scale used for stored monetary columns — mirrors Decimal(18,4) in Postgres. */
export const MONEY_SCALE = 4;
/** Scale used for stored quantity columns — mirrors Decimal(18,6). */
export const QUANTITY_SCALE = 6;
/** Scale for percentage fractions — Decimal(9,6), i.e. 0.301234 == 30.1234%. */
export const PERCENT_SCALE = 6;

export function d(value: Numeric | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Cannot build a Decimal from non-finite number: ${value}`);
    }
    // Route through the string form so 0.1 stays 0.1 rather than
    // 0.1000000000000000055511151231257827.
    return new Decimal(value.toString());
  }
  return new Decimal(value.toString());
}

/** Round to the monetary scale. Use before persisting or comparing money. */
export function money(value: Numeric | null | undefined): Decimal {
  return d(value).toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Round to the quantity scale. */
export function qty(value: Numeric | null | undefined): Decimal {
  return d(value).toDecimalPlaces(QUANTITY_SCALE, Decimal.ROUND_HALF_UP);
}

/** Round to the percentage scale. Input is a FRACTION (0.3), not 30. */
export function percent(value: Numeric | null | undefined): Decimal {
  return d(value).toDecimalPlaces(PERCENT_SCALE, Decimal.ROUND_HALF_UP);
}

export function sum(values: Numeric[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function sumMoney(values: Numeric[]): Decimal {
  return money(sum(values));
}

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export function isZero(value: Numeric | null | undefined): boolean {
  return d(value).isZero();
}

export function isPositive(value: Numeric | null | undefined): boolean {
  return d(value).greaterThan(0);
}

/**
 * Division that refuses to produce Infinity or NaN.
 * Financial ratios divide by things that can legitimately be zero (a menu item
 * priced at 0, a recipe yielding 0 portions) and silently returning Infinity
 * poisons every downstream aggregate.
 */
export function safeDivide(
  numerator: Numeric,
  denominator: Numeric,
  fallback: Numeric = 0,
): Decimal {
  const den = d(denominator);
  if (den.isZero()) return d(fallback);
  return d(numerator).dividedBy(den);
}

/** ratio(part, whole) as a fraction, 0 when whole is 0. */
export function ratio(part: Numeric, whole: Numeric): Decimal {
  return percent(safeDivide(part, whole, 0));
}

/** Converts a stored fraction into a display percentage number (0.3 → 30). */
export function toPercentDisplay(fraction: Numeric, decimals = 1): number {
  return d(fraction).times(100).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toNumber();
}

/** Serialises a Decimal for JSON transport without precision loss. */
export function serialize(value: Numeric | null | undefined): string {
  return d(value).toFixed();
}

/**
 * Formats an amount for Persian/Iranian display.
 * The currency is never hard-coded — the symbol is passed in from restaurant
 * settings so a deployment can run in Rial, Toman, or anything else.
 */
export function formatMoney(
  value: Numeric,
  options: {
    symbol?: string;
    locale?: string;
    decimals?: number;
    /** Render digits as ۰۱۲۳ instead of 0123. */
    persianDigits?: boolean;
  } = {},
): string {
  const {
    symbol = '',
    locale = 'fa-IR',
    decimals = 0,
    persianDigits = false,
  } = options;

  const rounded = d(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  let text = new Intl.NumberFormat(persianDigits ? locale : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded.toNumber());

  if (!persianDigits) text = toLatinDigits(text);
  return symbol ? `${text} ${symbol}` : text;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (ch) => PERSIAN_DIGITS[Number(ch)]);
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}
