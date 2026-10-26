import { supabase } from 'lib/supabase';

export type ChalanRow = { id: string; code: string; purchase_date: string; buy_rate: number; pcs_per_packet: number; status: 'open' | 'closed'; note: string | null };
export type SummaryRow = { chalan_id: string; code: string; status: string; bought_pcs: number; capital: number; sold_pcs: number; personal_pcs: number; adjusted_pcs: number; remaining: number; expenses: number };
export type SettlementRow = { chalan_id: string; partner_id: string; partner_name: string; capital: number; ext_rev: number; internal_rev: number; pcs_out: number; cost: number; profit: number; consumption_due: number; expenses_attributed: number; pocket_paid: number; entitlement: number };
export type PurchaseRow = { id: string; partner_id: string; qty: number; amount_paid: number };
export type ChalanItem = { partner_id: string; qty: number; amount_paid?: number };

export async function fetchChalans(): Promise<ChalanRow[]> {
  const { data, error } = await supabase.from('chalans').select('id, code, purchase_date, buy_rate, pcs_per_packet, status, note').order('purchase_date', { ascending: false });
  if (error) throw error;
  return data as ChalanRow[];
}

export async function fetchChalanByCode(code: string): Promise<ChalanRow | null> {
  const { data, error } = await supabase.from('chalans').select('id, code, purchase_date, buy_rate, pcs_per_packet, status, note').eq('code', code).maybeSingle();
  if (error) throw error;
  return data as ChalanRow | null;
}

export async function chalanSummary(id: string): Promise<SummaryRow | null> {
  const r = await supabase.from('v_chalan_summary').select('*').eq('chalan_id', id).maybeSingle();
  return r.data as SummaryRow | null;
}

export async function chalanSettlements(id: string): Promise<SettlementRow[]> {
  const r = await supabase.from('v_partner_chalan_settlement').select('*').eq('chalan_id', id);
  return r.data as SettlementRow[];
}

export async function chalanPurchases(id: string): Promise<PurchaseRow[]> {
  const r = await supabase.from('chalan_purchases').select('*').eq('chalan_id', id).is('deleted_at', null);
  return r.data as PurchaseRow[];
}

export async function createChalan(input: { purchase_date?: string | null; buy_rate?: number; pcs_per_packet?: number; note?: string | null; items: ChalanItem[] }): Promise<string> {
  const { data, error } = await supabase.rpc('create_chalan', { p_payload: input });
  if (error) throw error;
  return data as string;
}

export async function closeChalan(id: string): Promise<void> {
  const { error } = await supabase.rpc('close_chalan', { p_chalan_id: id });
  if (error) throw error;
}

export async function reopenChalan(id: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_chalan', { p_chalan_id: id });
  if (error) throw error;
}
