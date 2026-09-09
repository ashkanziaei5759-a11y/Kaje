import { describe, it, expect } from 'vitest';
import { localTimeIn } from '../src/server/services/menu';

describe('serving windows use the restaurant clock', () => {
  it('reads wall-clock time in the named timezone, not the server one', () => {
    // 11:12 UTC is 14:42 in Tehran (+03:30).
    const at = new Date('2026-09-08T11:12:00Z');
    expect(localTimeIn('Asia/Tehran', at).minuteOfDay).toBe(14 * 60 + 42);
    expect(localTimeIn('UTC', at).minuteOfDay).toBe(11 * 60 + 12);
  });

  it('puts a Tehran lunch service inside its window when the server is on UTC', () => {
    // The bug this guards: 11:12 UTC falls before a 12:00 opening, so a
    // UTC-hosted server marked the whole lunch menu closed during Tehran lunch.
    const at = new Date('2026-09-08T11:12:00Z');
    const { minuteOfDay } = localTimeIn('Asia/Tehran', at);
    expect(minuteOfDay).toBeGreaterThanOrEqual(12 * 60);
    expect(minuteOfDay).toBeLessThanOrEqual(23 * 60);
  });

  it('numbers the week from Saturday, as MenuAvailability stores it', () => {
    // 5 September 2026 is a Saturday.
    expect(localTimeIn('Asia/Tehran', new Date('2026-09-05T09:00:00Z')).dayOfWeek).toBe(0);
    expect(localTimeIn('Asia/Tehran', new Date('2026-09-06T09:00:00Z')).dayOfWeek).toBe(1);
    // 11 September 2026 is a Friday — the last day of the Iranian week.
    expect(localTimeIn('Asia/Tehran', new Date('2026-09-11T09:00:00Z')).dayOfWeek).toBe(6);
  });

  it('rolls the day over when the timezone offset crosses midnight', () => {
    // 21:00 UTC Friday is 00:30 Saturday in Tehran.
    const at = new Date('2026-09-11T21:00:00Z');
    expect(localTimeIn('Asia/Tehran', at).dayOfWeek).toBe(0);
    expect(localTimeIn('Asia/Tehran', at).minuteOfDay).toBe(30);
  });

  it('falls back to the server clock rather than throwing on a bad timezone', () => {
    const at = new Date('2026-09-08T11:12:00Z');
    expect(() => localTimeIn('Not/AZone', at)).not.toThrow();
    expect(localTimeIn('Not/AZone', at).minuteOfDay).toBeGreaterThanOrEqual(0);
  });

  it('reports midnight as 0, not 1440', () => {
    expect(localTimeIn('UTC', new Date('2026-09-08T00:00:00Z')).minuteOfDay).toBe(0);
  });
});
