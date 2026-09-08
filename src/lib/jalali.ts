/**
 * Jalali (Solar Hijri) calendar support.
 *
 * Implemented directly rather than pulled from a dependency: the conversion is
 * exact integer arithmetic, and it keeps the bundle free of a date library that
 * would otherwise ship to every client for the sake of one formatter.
 *
 * Algorithm: Borkowski's, as used by the standard jalaali implementations.
 */

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 1701, 1866,
  2020, 2317, 2394, 2456, 3178,
];

interface JalaliCal { leap: number; gy: number; march: number }

function jalCal(jy: number): JalaliCal {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new RangeError(`Jalali year ${jy} is outside the supported range`);
  }

  let jump = 0;
  for (let i = 1; i < bl; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

/** Gregorian date → Julian Day Number. */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** Julian Day Number → Gregorian date. */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export interface JalaliDate { jy: number; jm: number; jd: number }

export function toJalali(date: Date): JalaliDate {
  const jdn = g2d(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const gy = date.getFullYear();

  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    // r.leap refers to the year we just stepped back FROM, which is what
    // decides whether that year had 366 days.
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function fromJalali(jy: number, jm: number, jd: number): Date {
  const r = jalCal(jy);
  const jdn =
    g2d(r.gy, 3, r.march) +
    (jm - 1) * 31 -
    div(jm, 7) * (jm - 7) +
    jd - 1;
  const g = d2g(jdn);
  return new Date(g.gy, g.gm - 1, g.gd);
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
] as const;

export const JALALI_WEEKDAYS = [
  'شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه',
] as const;

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const fa = (n: number | string) =>
  String(n).replace(/[0-9]/g, (c) => PERSIAN_DIGITS[Number(c)]);

/**
 * Formats a date in Jalali.
 *   'short' → ۱۴۰۴/۰۶/۱۷
 *   'long'  → ۱۷ شهریور ۱۴۰۴
 *   'full'  → دوشنبه ۱۷ شهریور ۱۴۰۴
 */
export function formatJalali(
  date: Date,
  style: 'short' | 'long' | 'full' = 'long',
  persianDigits = true,
): string {
  const { jy, jm, jd } = toJalali(date);
  const n = (v: number | string) => (persianDigits ? fa(v) : String(v));

  switch (style) {
    case 'short':
      return `${n(jy)}/${n(String(jm).padStart(2, '0'))}/${n(String(jd).padStart(2, '0'))}`;
    case 'full': {
      // getDay(): 0=Sun. Saturday (6) is index 0 of the Iranian week.
      const weekday = JALALI_WEEKDAYS[(date.getDay() + 1) % 7];
      return `${weekday} ${n(jd)} ${JALALI_MONTHS[jm - 1]} ${n(jy)}`;
    }
    case 'long':
    default:
      return `${n(jd)} ${JALALI_MONTHS[jm - 1]} ${n(jy)}`;
  }
}

export function formatJalaliDateTime(date: Date, persianDigits = true): string {
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatJalali(date, 'long', persianDigits)} — ${persianDigits ? fa(time) : time}`;
}
