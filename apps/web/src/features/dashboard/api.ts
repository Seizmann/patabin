import { supabase } from 'lib/supabase';
import { dhakaDate, isoAtDhaka } from '@patabin/shared';

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
export type WalletBalance = { wallet_id: string; type: string; name?: string; label: string; balance: string | number };
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

export type PartnerBalance = { partner_id: string; partner_name: string; balance: number };

export async function fetchPartnerBalances(start: string, end: string): Promise<PartnerBalance[]> {
  const { data, error } = await supabase.rpc('partner_balance_flows', { p_start: start, p_end: end });
  if (error) throw error;
  return ((data ?? []) as { partner_id: string; partner_name: string; balance: number | string }[]).map((p) => ({
    partner_id: p.partner_id,
    partner_name: p.partner_name,
    balance: Number(p.balance),
  }));
}

function sliceLabel(s: string): string {
  const [type = '', name = ''] = s.split('|');
  if (type === 'personal') return 'ব্যক্তিগত ব্যবহার';
  const base = type === 'cash' ? 'ক্যাশ' : type === 'bkash' ? 'বিকাশ' : type === 'nagad' ? 'নগদ' : type;
  return name ? `${base} · ${name}` : base;
}

export async function fetchStockCurrent(): Promise<number> {
  const { data, error } = await supabase.from('v_packet_stock').select('remaining');
  if (error) throw error;
  return ((data ?? []) as { remaining: number | string }[]).reduce((acc, r) => acc + Number(r.remaining), 0);
}

export async function fetchStockByPartner(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('v_packet_stock').select('owner_name, remaining');
  if (error) throw error;
  const byPartner: Record<string, number> = {};
  for (const r of (data ?? []) as { owner_name: string; remaining: number | string }[]) {
    byPartner[r.owner_name] = (byPartner[r.owner_name] ?? 0) + Number(r.remaining);
  }
  return byPartner;
}

export async function fetchWalletBalances(start: string, end: string): Promise<WalletBalance[]> {
  const { data, error } = await supabase.rpc('wallet_flows', { p_start: start, p_end: end });
  if (error) throw error;
  return ((data ?? []) as { wallet_id: string; type: string; name: string; label: string; amount: number | string }[]).map((w) => ({
    wallet_id: w.wallet_id,
    type: w.type,
    name: w.name,
    label: w.label,
    balance: Number(w.amount),
  }));
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

export type LeaderRow = { id: string; name: string; paid: number };

export function dhakaWeekStart(now: Date = new Date()): string {
  const dt = dhakaDate(now);
  const [y, m, d] = dt.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const back = (weekday + 1) % 7;
  return isoAtDhaka(new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10));
}

export async function fetchCustomerLeaderboard(): Promise<LeaderRow[]> {
  const weekStart = dhakaWeekStart();
  const [custRes, salesRes, payRes] = await Promise.all([
    supabase.from('customers').select('id, name').is('deleted_at', null),
    supabase.from('sales').select('customer_id, amount_received').is('deleted_at', null).not('customer_id', 'is', null).gte('sold_at', weekStart),
    supabase.from('customer_payments').select('customer_id, amount').is('deleted_at', null).gte('at', weekStart),
  ]);
  if (custRes.error) throw custRes.error;
  if (salesRes.error) throw salesRes.error;
  if (payRes.error) throw payRes.error;
  const names = new Map((custRes.data ?? []).map((c) => [c.id, c.name]));
  const paidBy = new Map<string, number>();
  for (const s of (salesRes.data ?? []) as { customer_id: string; amount_received: string | number }[]) {
    paidBy.set(s.customer_id, (paidBy.get(s.customer_id) ?? 0) + Number(s.amount_received));
  }
  for (const p of (payRes.data ?? []) as { customer_id: string; amount: string | number }[]) {
    paidBy.set(p.customer_id, (paidBy.get(p.customer_id) ?? 0) + Number(p.amount));
  }
  return [...paidBy.entries()]
    .filter(([id]) => names.has(id))
    .map(([id, paid]) => ({ id, name: names.get(id)!, paid }))
    .sort((a, b) => b.paid - a.paid)
    .slice(0, 5);
}
