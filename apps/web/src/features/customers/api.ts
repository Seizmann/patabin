import { supabase } from 'lib/supabase';

export type CustomerRow = { id: string; name: string; phone: string | null };
export type CustomerBalanceRow = { customer_id: string; name: string; phone: string | null; balance: string | number };
export type PaymentRow = { id: string; customer_id: string; amount: string | number; wallet_account_id: string; at: string; note: string | null };
export type WalletRow = { id: string; type: string; name: string; label: string };

export async function fetchCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase.from('customers').select('id, name, phone').is('deleted_at', null).order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchCustomerBalances(): Promise<CustomerBalanceRow[]> {
  const { data, error } = await supabase.from('v_customer_balance').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as CustomerBalanceRow[];
}

export async function fetchPayments(): Promise<PaymentRow[]> {
  const { data, error } = await supabase.from('customer_payments').select('id, customer_id, amount, wallet_account_id, at, note').is('deleted_at', null).order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PaymentRow[];
}

export async function createPayment(input: { customer_id: string; amount: number; wallet_account_id: string; note?: string | null; at?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('create_customer_payment', { p_pay: input });
  if (error) throw error;
}

export async function fetchWallets(): Promise<WalletRow[]> {
  const { data, error } = await supabase.from('wallets').select('id, type, name, label').eq('is_active', true).order('type');
  if (error) throw error;
  return (data ?? []) as WalletRow[];
}

export async function createCustomer(name: string, phone: string | null): Promise<string> {
  const { data, error } = await supabase.from('customers').insert({ name, phone }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateCustomer(id: string, name: string, phone: string | null): Promise<void> {
  const { error } = await supabase.from('customers').update({ name, phone }).eq('id', id);
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
