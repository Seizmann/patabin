import { supabase } from 'lib/supabase';

export async function fetchSettings(): Promise<{ default_buy_rate: number; default_sell_price: number; default_packet_size: number }> {
  const { data, error } = await supabase.from('settings').select('default_buy_rate, default_sell_price, default_packet_size').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function fetchPartners(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('partners').select('id, name').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function myPartnerId(): Promise<string | null> {
  const { data: profile } = await supabase.from('profiles').select('id').maybeSingle();
  if (!profile) return null;
  const { data } = await supabase.from('partners').select('id').eq('user_id', profile.id).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
