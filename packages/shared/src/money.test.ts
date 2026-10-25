import { afterEach, describe, expect, it } from 'vitest';
import { normalizeDigits, toBnDigits } from './digits';
import { formatMoney, roundMoney } from './money';
import { dbDateTime, periodRange } from './time';

describe('digits', () => {
  it('converts both ways', () => {
    expect(normalizeDigits('১২৩০')).toBe('1230');
    expect(normalizeDigits('5য়')).toBe('5য়');
    expect(toBnDigits('123')).toBe('১২৩');
  });
});

describe('money', () => {
  it('formats lakh grouping and taka sign', () => {
    expect(formatMoney(57583.33, { digits: false })).toBe('৳57,583.33');
    expect(formatMoney(300)).toBe('৳৩০০');
  });
  it('rounds half up at 2 decimals', () => {
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });
});

describe('time', () => {
  it('converts a custom datetime with explicit +06:00 offset', () => {
    expect(dbDateTime('2026-10-25T18:30')).toBe('2026-10-25T18:30:00+06:00');
  });
  it('periods use Dhaka boundaries regardless of device timezone', () => {
    const instant = '2026-10-25T10:00:00Z';
    const [todayStart, todayEnd] = periodRange('today', instant);
    const [monthStart, monthEnd] = periodRange('month', instant);
    expect(todayStart).toBe('2026-10-25T00:00:00+06:00');
    expect(todayEnd).toBe('2026-10-26T00:00:00+06:00');
    expect(monthStart).toBe('2026-10-01T00:00:00+06:00');
    expect(monthEnd).toBe('2026-10-26T00:00:00+06:00');
  });
  it('last month spans the previous Dhaka month', () => {
    const [s, e] = periodRange('lastMonth', '2026-01-15T12:00:00Z');
    expect(s).toBe('2025-12-01T00:00:00+06:00');
    expect(e).toBe('2026-01-01T00:00:00+06:00');
  });
  it('ignores a non-Dhaka device timezone', () => {
    process.env.TZ = 'America/New_York';
    const instant = '2026-10-25T10:00:00Z';
    expect(dbDateTime('2026-10-25T18:30')).toBe('2026-10-25T18:30:00+06:00');
    expect(periodRange('today', instant)).toEqual(['2026-10-25T00:00:00+06:00', '2026-10-26T00:00:00+06:00']);
  });
});

afterEach(() => {
  delete process.env.TZ;
});
