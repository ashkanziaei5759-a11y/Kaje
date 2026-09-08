import { describe, it, expect } from 'vitest';
import { toJalali, fromJalali, formatJalali } from '../src/lib/jalali';

describe('Jalali conversion', () => {
  it('converts Nowruz correctly', () => {
    // 20 March 2024 == 1 Farvardin 1403
    expect(toJalali(new Date(2024, 2, 20))).toEqual({ jy: 1403, jm: 1, jd: 1 });
    // 1403 is a leap year (Esfand has 30 days), so Nowruz 1404 falls a day
    // later. Verified against Intl's Persian calendar.
    expect(toJalali(new Date(2025, 2, 20))).toEqual({ jy: 1403, jm: 12, jd: 30 });
    expect(toJalali(new Date(2025, 2, 21))).toEqual({ jy: 1404, jm: 1, jd: 1 });
  });

  it('converts a mid-year date', () => {
    // 8 September 2026 == 17 Shahrivar 1405
    expect(toJalali(new Date(2026, 8, 8))).toEqual({ jy: 1405, jm: 6, jd: 17 });
  });

  it('agrees with the ICU Persian calendar across a decade', () => {
    const icu = new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
    });
    for (let offset = 0; offset < 3650; offset += 11) {
      const date = new Date(Date.UTC(2021, 0, 1 + offset, 12));
      const [m, dd, y] = icu.format(date).replace(' AP', '').split('/').map(Number);
      const local = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      expect(toJalali(local)).toEqual({ jy: y, jm: m, jd: dd });
    }
  });

  it('round-trips in both directions across a full year', () => {
    for (let offset = 0; offset < 400; offset += 7) {
      const gregorian = new Date(2025, 0, 1 + offset);
      const { jy, jm, jd } = toJalali(gregorian);
      const back = fromJalali(jy, jm, jd);
      expect(back.toDateString()).toBe(gregorian.toDateString());
    }
  });

  it('formats with Persian digits and month names', () => {
    const date = new Date(2026, 8, 8);
    expect(formatJalali(date, 'long')).toBe('۱۷ شهریور ۱۴۰۵');
    expect(formatJalali(date, 'short')).toBe('۱۴۰۵/۰۶/۱۷');
    expect(formatJalali(date, 'long', false)).toBe('17 شهریور 1405');
  });

  it('names the weekday against a Saturday-first week', () => {
    // 8 September 2026 is a Tuesday → سه‌شنبه
    expect(formatJalali(new Date(2026, 8, 8), 'full')).toContain('سه‌شنبه');
  });
});
