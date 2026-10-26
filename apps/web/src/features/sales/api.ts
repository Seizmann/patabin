import { supabase } from 'lib/supabase';

export type SaleRowV = {
  id: string;
  sold_at: string;
  qty: number;
  list_unit_price: number;
  amount_received: number;
  due_amount: number;
  discount: number;
  discount_pct: number | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  wallet_type: string;
  wallet_name: string;
  wallet_label: string;
  wallet_details: string;
  note: string | null;
  created_at: string;
  packet_codes: string;
  owner_names: string;
};

export type ReceiveInput = { wallet_account_id: string; amount: number };

export type SaleInput = {
  qty: number;
  list_unit_price: number;
  amount_received: number;
  due_amount?: number;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  wallet_account_id: string;
  receives?: ReceiveInput[];
  note?: string | null;
  sold_at?: string | null;
};

export async function fetchWallets(): Promise<{ id: string; type: string; name: string; label: string }[]> {
  const { data, error } = await supabase.from('wallets').select('id, type, name, label').eq('is_active', true).order('type');
  if (error) throw error;
  return data ?? [];
}

export async function fetchPacketsPreview(): Promise<{ packet_id: string; packet_code: string; owner_name: string; remaining: number; position: number | null }[]> {
  const { data, error } = await supabase.from('v_packet_stock').select('packet_id, packet_code, owner_name, remaining, position').eq('chalan_status', 'open').order('position');
  if (error) throw error;
  return (data ?? []).filter((p) => Number(p.remaining) > 0);
}

export async function fetchSales(from: string, to: string): Promise<SaleRowV[]> {
  const { data, error } = await supabase.from('v_sales_enriched').select('*').gte('sold_at', from).lt('sold_at', to).order('sold_at', { ascending: false });
  if (error) throw error;
  return data as SaleRowV[];
}

export async function createSale(input: SaleInput): Promise<void> {
  const { error } = await supabase.rpc('create_sale', { p_sale: input });
  if (error) throw error;
}

export async function updateSale(id: string, input: SaleInput): Promise<void> {
  const { error } = await supabase.rpc('update_sale', { p_id: id, p_sale: input });
  if (error) throw error;
}

export async function deleteSale(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_sale', { p_id: id });
  if (error) throw error;
}
