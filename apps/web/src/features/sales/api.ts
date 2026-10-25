import { supabase } from 'lib/supabase';

export type SaleRowV = {
  id: string;
  sold_at: string;
  kind: string;
  customer_name: string | null;
  customer_partner_name: string | null;
  received_by_name: string | null;
  qty: number;
  list_unit_price: number;
  amount_received: number;
  discount: number;
  discount_pct: number | null;
  payment_method: string | null;
  note: string | null;
  created_at: string;
  batch_codes: string;
  allocation_complete: boolean;
};

export type PartnerRow = { id: string; name: string };

export type SaleInput = {
  kind: 'external' | 'internal';
  customer_name?: string | null;
  partner_id?: string | null;
  received_by_partner_id?: string | null;
  qty: number;
  list_unit_price: number;
  amount_received: number;
  payment_method?: string | null;
  note?: string | null;
  sold_at?: string | null;
};

const ERRORS: Record<string, string> = {
  NO_STOCK: 'পর্যাপ্ত স্টক নেই; পরিমাণ কমিয়ে দিন।',
  SALE_INVALID: 'তথ্য একদম মিলছে না; আবার দেখুন।',
  BATCH_CLOSED: 'সংশ্লিষ্ট ব্যাচ বন্ধ হয়ে গেছে; সম্পাদনা সাধ্য নয়।',
  NOT_ACTIVE: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয়।',
  CHANGE_PASSWORD_REQUIRED: 'প্রথমে পাসওয়ার্ড পরিবর্তন করুন।',
};

export function mapError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = Object.keys(ERRORS).find((k) => msg.includes(k));
  return code ? ERRORS[code]! : 'সমস্যা হয়েছে; আবার চেষ্টা করুন।';
}

export async function fetchPartners(): Promise<PartnerRow[]> {
  const { data, error } = await supabase.from('partners').select('id, name').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchSettings(): Promise<{ default_buy_rate: number; default_sell_price: number }> {
  const { data, error } = await supabase.from('settings').select('default_buy_rate, default_sell_price').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function fetchStock(): Promise<number> {
  const { data, error } = await supabase.rpc('available_pcs');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchSales(from: string, to: string): Promise<SaleRowV[]> {
  const { data, error } = await supabase
    .from('v_sales_enriched')
    .select('*')
    .gte('sold_at', from)
    .lt('sold_at', to)
    .order('sold_at', { ascending: false });
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
