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

export type PacketSaleRow = { sold_at: string; qty: number; amount_received: number; due_amount: number; customer_id: string | null; customer_name: string | null; customer_phone: string | null };

export async function fetchPacketSales(packetId: string): Promise<PacketSaleRow[]> {
  const { data, error } = await supabase
    .from('sale_allocations')
    .select('qty, sales!inner(sold_at, qty, customer_id, customer_name, customer_phone, amount_received, due_amount, deleted_at)')
    .eq('packet_id', packetId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as { qty: number; sales: { sold_at: string; customer_id: string | null; customer_name: string | null; customer_phone: string | null; amount_received: number; due_amount: number; deleted_at: string | null } }[];
  return rows
    .filter((r) => r.sales && !r.sales.deleted_at)
    .map((r) => ({ sold_at: r.sales.sold_at, customer_id: r.sales.customer_id, customer_name: r.sales.customer_name, customer_phone: r.sales.customer_phone, amount_received: r.sales.amount_received, due_amount: r.sales.due_amount, qty: r.qty }))
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at));
}

export async function fetchOpenSummaries(): Promise<{ chalan_id: string; code: string; remaining: number; pcs_per_packet_hint: number }[]> {
  const { data, error } = await supabase.from('v_chalan_summary').select('*').eq('status', 'open');
  if (error) throw error;
  return ((data ?? []) as { chalan_id: string; code: string; remaining: number }[]).map((x) => ({ ...x, pcs_per_packet_hint: 20 }));
}
