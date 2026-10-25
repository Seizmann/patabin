import { toBnDigits } from './digits';
import { roundMoney } from './round';

const TAKA = '\u09f3';

export function formatMoney(v: number | string, opts?: { digits?: boolean }): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return `${TAKA}${toBnDigits(0)}`;
  const grouped = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
  return `${TAKA}${opts?.digits === false ? grouped : toBnDigits(grouped)}`;
}

export function formatQty(v: number | string): string {
  return toBnDigits(v);
}

export { roundMoney };
