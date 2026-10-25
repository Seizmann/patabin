import { supabase } from 'lib/supabase';

export type ExpenseRow = { id: string; batch_id: string; spent_on: string; category: string; cost_type: string; amount: string | number; paid_by_partner_id: string | null; funding: string; note: string | null };
export type PartnerRow = { id: string; name: string };

export async function fetchOpenBatches(): Promise<{ id: string; code: string }[]> {
  const { data, error } = await supabase.from('batches').select('id, code').eq('status', 'open').order('purchase_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPartners(): Promise<PartnerRow[]> {
  const { data, error } = await supabase.from('partners').select('id, name').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, batch_id, spent_on, category, cost_type, amount, paid_by_partner_id, funding, note')
    .is('deleted_at', null)
    .order('spent_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertExpense(input: {
  batch_id: string;
  spent_on?: string | null;
  category: string;
  cost_type: string;
  amount: number;
  paid_by_partner_id: string;
  funding: string;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('expenses').insert({ ...input, note: input.note || null, spent_on: input.spent_on ?? null });
  if (error) throw error;
}

export async function softDeleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
