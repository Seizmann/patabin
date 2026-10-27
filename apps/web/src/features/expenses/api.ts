import { supabase } from 'lib/supabase';

export type ExpenseRow = { id: string; category_id: string; amount: string | number; paid_by_partner_id: string; attributed_to_partner_id: string; wallet_account_id: string | null; chalan_id: string | null; note: string | null; spent_at: string };
export type PartnerRow = { id: string; name: string };
export type WalletRow = { id: string; type: string; name: string; label: string };

export async function fetchExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, category_id, amount, paid_by_partner_id, attributed_to_partner_id, wallet_account_id, chalan_id, note, spent_at')
    .is('deleted_at', null)
    .order('spent_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createExpense(input: {
  category_id: string;
  amount: number;
  paid_by_partner_id: string;
  attributed_to_partner_id: string;
  wallet_account_id?: string | null;
  chalan_id?: string | null;
  note?: string | null;
  spent_at?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('create_expense', { p_exp: input });
  if (error) throw error;
}

export async function fetchWallets(): Promise<WalletRow[]> {
  const { data, error } = await supabase.from('wallets').select('id, type, name, label').eq('is_active', true).order('type');
  if (error) throw error;
  return data ?? [];
}

export async function fetchPartners(): Promise<PartnerRow[]> {
  const { data, error } = await supabase.from('partners').select('id, name').order('name');
  if (error) throw error;
  return data ?? [];
}
