import { supabase } from 'lib/supabase';

export type Totals = {
  income: number;
  expenses: number;
  discount_total: number;
  realized_cost: number;
  net_profit: number;
  list_value: number;
  cash_received: number;
  stock_current: number;
};

export type Slice = { slice: string; amount: number };
export type BalanceRow = { partner_id: string; partner_name: string; balance: string | number };
export type WalletBalance = { wallet_id: string; type: string; label: string; balance: string | number };
export type DayRow = { day: string; income: string | number };

export async function fetchTotals(start: string, end: string): Promise<Totals> {
  const { data, error } = await supabase.rpc('dashboard_totals', { p_start: start, p_end: end });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, string | number> | null;
  if (!row) throw new Error('no-data');
  return {
    income: Number(row.income),
    expenses: Number(row.expenses),
    discount_total: Number(row.discount_total),
    realized_cost: Number(row.realized_cost),
    net_profit: Number(row.net_profit),
    list_value: Number(row.list_value),
    cash_received: Number(row.cash_received),
    stock_current: Number(row.stock_current),
  };
}

export async function fetchBreakdown(start: string, end: string): Promise<Slice[]> {
  const { data, error } = await supabase.rpc('income_by_period_breakdown', { p_start: start, p_end: end });
  if (error) throw error;
  return ((data ?? []) as { slice: string; amount: number }[]).map((r) => ({ slice: sliceLabel(r.slice), amount: Number(r.amount) }));
}

function sliceLabel(s: string): string {
  const [type = '', label = ''] = s.split('|');
  if (type === 'personal') return 'ব্যক্তিগত ব্যবহার';
  const base = type === 'cash' ? 'ক্যাশ' : type === 'bkash' ? 'বিকাশ' : type === 'nagad' ? 'নগদ' : type;
  return label && label !== 'Cash' ? `${base} · ${label}` : base;
}

export async function fetchStockCurrent(): Promise<number> {
  const { data, error } = await supabase.from('v_packet_stock').select('remaining');
  if (error) throw error;
  return ((data ?? []) as { remaining: number | string }[]).reduce((acc, r) => acc + Number(r.remaining), 0);
}

export async function fetchBalances(): Promise<BalanceRow[]> {
  const { data, error } = await supabase.from('v_partner_balance').select('*').order('partner_name');
  if (error) throw error;
  return (data ?? []) as BalanceRow[];
}

export async function fetchWalletBalances(): Promise<WalletBalance[]> {
  const { data, error } = await supabase.from('v_wallet_balance').select('*').order('type');
  if (error) throw error;
  return (data ?? []) as WalletBalance[];
}

export async function fetchDailyIncome(start: string, end: string): Promise<DayRow[]> {
  const [sales, uses] = await Promise.all([
    supabase.from('v_sales_enriched').select('sold_at, amount_received').gte('sold_at', start).lt('sold_at', end),
    supabase.from('personal_uses').select('at, qty, unit_value').is('deleted_at', null).gte('at', start).lt('at', end),
  ]);
  if (sales.error) throw sales.error;
  if (uses.error) throw uses.error;
  const byDay = new Map<string, number>();
  for (const r of (sales.data ?? []) as { sold_at: string; amount_received: number }[]) {
    const day = r.sold_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.amount_received));
  }
  for (const r of (uses.data ?? []) as { at: string; qty: number; unit_value: number }[]) {
    const day = r.at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.qty) * Number(r.unit_value));
  }
  return [...byDay.entries()].sort().map(([day, income]) => ({ day, income }));
}
