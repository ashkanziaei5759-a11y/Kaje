/**
 * Presentation-layer formatting. Client-safe (no server-only imports).
 *
 * Currency symbol and locale always arrive from restaurant settings — nothing
 * here assumes Toman, or Persian, or Iran.
 */
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (c) => PERSIAN_DIGITS[Number(c)]);
}

export interface CurrencyOptions {
  symbol?: string;
  persianDigits?: boolean;
  /** Abbreviate large figures: ۱۲٫۵ م instead of ۱۲٬۵۰۰٬۰۰۰. */
  compact?: boolean;
  decimals?: number;
}

export function formatCurrency(value: string | number, options: CurrencyOptions = {}): string {
  const { symbol, persianDigits = true, compact = false, decimals = 0 } = options;
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';

  let text: string;
  let suffix = '';

  if (compact && Math.abs(n) >= 1_000_000_000) {
    text = (n / 1_000_000_000).toFixed(1);
    suffix = ' میلیارد';
  } else if (compact && Math.abs(n) >= 1_000_000) {
    text = (n / 1_000_000).toFixed(1);
    suffix = ' م';
  } else if (compact && Math.abs(n) >= 1_000) {
    text = (n / 1_000).toFixed(0);
    suffix = ' هزار';
  } else {
    text = n.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  const out = persianDigits ? faDigits(text) : text;
  return `${out}${suffix}${symbol ? ` ${symbol}` : ''}`;
}

/** Renders a stored FRACTION (0.3) as a percentage string (۳۰٫۰٪). */
export function formatPercent(
  fraction: string | number,
  options: { decimals?: number; persianDigits?: boolean; sign?: boolean } = {},
): string {
  const { decimals = 1, persianDigits = true, sign = false } = options;
  const n = typeof fraction === 'string' ? Number(fraction) : fraction;
  if (!Number.isFinite(n)) return '—';
  const value = (n * 100).toFixed(decimals);
  const prefix = sign && n > 0 ? '+' : '';
  return `${prefix}${persianDigits ? faDigits(value) : value}٪`;
}

export function formatNumber(value: string | number, persianDigits = true): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  const text = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return persianDigits ? faDigits(text) : text;
}

/** Colour class for a margin figure: healthy, thin, or losing money. */
export function marginTone(fraction: string | number, target = 0.25): string {
  const n = Number(fraction);
  if (!Number.isFinite(n)) return 'text-ink-400';
  if (n <= 0) return 'text-pomegranate-400';
  if (n < target) return 'text-saffron-400';
  return 'text-pistachio-400';
}
