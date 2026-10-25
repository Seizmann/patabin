import { supabase } from 'lib/supabase';

export type Totals = {
  income: number;
  expenses: number;
  landed_expenses: number;
  discount_total: number;
  realized_cost: number;
  net_profit: number;
  list_value: number;
  cash_received: number;
  stock_current: number;
};

export type Slice = { slice: string; amount: number };
export type BalanceRow = { partner_id: string; partner_name: string; entitlement: string | number; cash_held: string | number; balance: string | number };
export type DayRow = { day: string; income: string | number };

export async function fetchTotals(start: string, end: string): Promise<Totals> {
  const { data, error } = await supabase.rpc('dashboard_totals', { p_start: start, p_end: end });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, string | number> | null;
  if (!row) throw new Error('no-data');
  return {
    income: Number(row.income),
    expenses: Number(row.expenses),
    landed_expenses: Number(row.landed_expenses),
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
  return ((data ?? []) as { slice: string; amount: number }[]).map((r) => ({ slice: r.slice, amount: Number(r.amount) }));
}

export async function fetchStockCurrent(): Promise<number> {
  const { data, error } = await supabase.rpc('available_pcs');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchBalances(): Promise<BalanceRow[]> {
  const { data, error } = await supabase.from('v_partner_balance').select('*').order('partner_name');
  if (error) throw error;
  return (data ?? []) as BalanceRow[];
}

export async function fetchDailyIncome(start: string, end: string): Promise<DayRow[]> {
  const { data, error } = await supabase
    .from('v_dashboard_day')
    .select('*')
    .gte('day', start.slice(0, 10))
    .lte('day', end.slice(0, 10))
    .order('day');
  if (error) throw error;
  return (data ?? []) as DayRow[];
}

export const METHOD_BN: Record<string, string> = {
  cash: 'নগদ',
  bkash: 'বিকাশ',
  nagad: 'নগদ (এপ)',
  rocket: 'রকেট',
  bank: 'ব্যাংক',
  other: 'অন্যান্য',
  unspecified: 'মাধ্যম নেই',
  personal: 'ব্যক্তিগত ব্যবহার',
};
