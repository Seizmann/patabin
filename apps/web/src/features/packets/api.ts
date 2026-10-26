import { supabase } from 'lib/supabase';

export type PacketRow = { packet_id: string; chalan_id: string; chalan_code: string; chalan_status: string; packet_code: string; owner_partner_id: string; owner_name: string; total_pcs: number; remaining: number; position: number | null };

export async function fetchPackets(): Promise<PacketRow[]> {
  const { data, error } = await supabase.from('v_packet_stock').select('*');
  if (error) throw error;
  return (data ?? []) as PacketRow[];
}

export async function createPackets(input: { chalan_id: string; pcs_per_packet: number; packed_at?: string | null; items: { partner_id: string; pcs: number }[] }): Promise<void> {
  const { error } = await supabase.rpc('create_packets', { p_payload: input });
  if (error) throw error;
}

export async function savePriority(ordered: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_sell_priority', { p_ordered: ordered });
  if (error) throw error;
}

export async function fetchOpenSummaries(): Promise<{ chalan_id: string; code: string; remaining: number; pcs_per_packet_hint: number }[]> {
  const { data, error } = await supabase.from('v_chalan_summary').select('*').eq('status', 'open');
  if (error) throw error;
  return ((data ?? []) as { chalan_id: string; code: string; remaining: number }[]).map((x) => ({ ...x, pcs_per_packet_hint: 20 }));
}
