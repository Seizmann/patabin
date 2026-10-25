export const DHAKA = 'Asia/Dhaka';
const OFFSET = '+06:00';

type Parts = { y: number; m: number; d: number };

function dhakaParts(instant: Date | string): Parts {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: DHAKA, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = f.format(typeof instant === 'string' ? new Date(instant) : instant).split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

export function isoAtDhaka(dt: string, time = '00:00:00'): string {
  return `${dt}T${time}${OFFSET}`;
}

export function dbDateTime(dhakaLocal: string): string {
  return dhakaLocal.includes('T') ? `${dhakaLocal}:00${OFFSET}` : isoAtDhaka(dhakaLocal);
}

export function dhakaDate(instant: Date | string): string {
  const { y, m, d } = dhakaParts(instant);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function todayStart(instant: Date | string): string {
  return isoAtDhaka(dhakaDate(instant));
}

function nextDay(dt: string): string {
  const [y, m, d] = dt.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function dhakaWeekday(dt: string): number {
  const [y, m, d] = dt.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function periodRange(kind: 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'all', instant: Date | string): [string, string] {
  const now = dhakaDate(instant);
  if (kind === 'all') return ['2000-01-01', nextDay(dhakaDate(new Date()))];
  if (kind === 'today') return [todayStart(instant), isoAtDhaka(nextDay(now))];
  if (kind === 'yesterday') {
    const day = new Date(Date.UTC(now.split('-').map(Number)[0]!, now.split('-').map(Number)[1]! - 1, now.split('-').map(Number)[2]! - 1)).toISOString().slice(0, 10);
    return [isoAtDhaka(day), isoAtDhaka(now)];
  }
  if (kind === 'week') {
    const [y, m, d] = now.split('-').map(Number) as [number, number, number];
    const start = new Date(Date.UTC(y, m - 1, d - dhakaWeekday(now), 0)).toISOString().slice(0, 10);
    return [isoAtDhaka(start), isoAtDhaka(nextDay(now))];
  }
  const [y, m] = now.split('-').map(Number) as [number, number];
  if (kind === 'month') return [isoAtDhaka(`${y}-${String(m).padStart(2, '0')}-01`), isoAtDhaka(nextDay(now))];
  const start = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  const end = m === 1 ? `${y}-01-01` : `${y}-${String(m).padStart(2, '0')}-01`;
  return [isoAtDhaka(start), isoAtDhaka(end)];
}

export function formatDhakaDateTime(instant: string | Date, locale = 'bn-BD'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: DHAKA,
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof instant === 'string' ? new Date(instant) : instant);
}

export function formatDhakaDate(instant: string | Date, locale = 'bn-BD'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: DHAKA, dateStyle: 'medium' }).format(
    typeof instant === 'string' ? new Date(instant) : instant
  );
}
