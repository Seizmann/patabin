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

export type PacketCustomerRow = {
  key: string;
  customer_name: string | null;
  customer_phone: string | null;
  pcs: number;
  sold_amount: number;
  received: number;
  due: number;
  methods: { type: string; label: string; amount: number }[];
};

export type PacketMethodRow = { type: string; label: string; amount: number };

export type PacketAdjustmentRow = { reason: 'gift' | 'damage' | 'loss' | 'sample' | 'other'; qty: number; person: string | null; at: string };

export type PacketPersonalRow = { qty: number; eater_name: string | null; at: string };

export type PacketDetail = {
  sales: (PacketSaleRow & { methods: PacketMethodRow[] })[];
  byCustomer: PacketCustomerRow[];
  byMethod: PacketMethodRow[];
  adjustments: PacketAdjustmentRow[];
  personal: PacketPersonalRow[];
  totals: { sold: number; sold_amount: number; received: number; due: number; adjusted: number; personal: number };
};

type RawReceive = { amount: string | number; wallets: { type: string; name: string; label: string } | null };

export async function fetchPacketDetail(packetId: string): Promise<PacketDetail> {
  const [salesRes, adjRes, persRes] = await Promise.all([
    supabase
      .from('sale_allocations')
      .select('qty, sales!inner(id, qty, sold_at, list_unit_price, customer_id, customer_name, customer_phone, amount_received, due_amount, deleted_at, sale_receives(amount, wallets(type, name, label)))')
      .eq('packet_id', packetId),
    supabase.from('stock_adjustments').select('qty, reason, person, at, deleted_at').eq('packet_id', packetId),
    supabase.from('personal_uses').select('qty, at, deleted_at, partners(name)').eq('packet_id', packetId),
  ]);
  if (salesRes.error) throw salesRes.error;
  if (adjRes.error) throw adjRes.error;
  if (persRes.error) throw persRes.error;

  type RawSale = {
    id: string;
    qty: number;
    sold_at: string;
    list_unit_price: string | number;
    customer_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    amount_received: string | number;
    due_amount: string | number;
    deleted_at: string | null;
    sale_receives: RawReceive[] | null;
  };
  type RawAlloc = { qty: number; sales: RawSale | null };
  type RawAdj = { qty: number; reason: string; person: string | null; at: string; deleted_at: string | null };
  type RawPers = { qty: number; at: string; deleted_at: string | null; partners: { name: string } | null };

  const allocs = ((salesRes.data ?? []) as unknown as RawAlloc[]).filter((r) => r.sales && !r.sales.deleted_at);

  const sales = allocs
    .map((r) => {
      const s = r.sales!;
      const ratio = s.qty > 0 ? r.qty / s.qty : 1;
      const rawReceives: RawReceive[] = s.sale_receives ?? [];
      const methods = rawReceives
        .filter((rr) => rr.wallets && Number(rr.amount) > 0)
        .map((rr) => ({ type: rr.wallets!.type, label: rr.wallets!.label, amount: Number(rr.amount) * ratio }));
      return {
        sold_at: s.sold_at,
        qty: r.qty,
        sold_amount: r.qty * Number(s.list_unit_price),
        amount_received: Number(s.amount_received) * ratio,
        due_amount: Number(s.due_amount) * ratio,
        customer_id: s.customer_id,
        customer_name: s.customer_name,
        customer_phone: s.customer_phone,
        methods,
      };
    })
    .sort((a, b) => b.sold_at.localeCompare(a.sold_at));

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const byCustomerMap = new Map<string, PacketCustomerRow>();
  const methodMap = new Map<string, PacketMethodRow>();
  for (const s of sales) {
    const key = s.customer_id ?? s.customer_name ?? s.customer_phone ?? '';
    if (!byCustomerMap.has(key)) {
      byCustomerMap.set(key, { key, customer_name: s.customer_name, customer_phone: s.customer_phone, pcs: 0, sold_amount: 0, received: 0, due: 0, methods: [] });
    }
    const c = byCustomerMap.get(key)!;
    c.pcs += s.qty;
    c.sold_amount += s.sold_amount;
    c.received += s.amount_received;
    c.due += s.due_amount;
    for (const m of s.methods) {
      const mk = `${m.type}|${m.label}`;
      const cm = c.methods.find((x) => x.type === m.type && x.label === m.label);
      if (cm) cm.amount += m.amount;
      else c.methods.push({ type: m.type, label: m.label, amount: m.amount });
      const gm = methodMap.get(mk);
      if (gm) gm.amount += m.amount;
      else methodMap.set(mk, { ...m });
    }
  }
  const byCustomer = [...byCustomerMap.values()].map((c) => ({
    ...c,
    sold_amount: round2(c.sold_amount),
    received: round2(c.received),
    due: round2(c.due),
    methods: c.methods.map((m) => ({ ...m, amount: round2(m.amount) })).sort((a, b) => b.amount - a.amount),
  }));
  const byMethod = [...methodMap.values()].map((m) => ({ ...m, amount: round2(m.amount) })).sort((a, b) => b.amount - a.amount);

  const adjustments = ((adjRes.data ?? []) as unknown as RawAdj[])
    .filter((a) => !a.deleted_at)
    .map((a) => ({ reason: a.reason as PacketAdjustmentRow['reason'], qty: a.qty, person: a.person, at: a.at }));
  const personal = ((persRes.data ?? []) as unknown as RawPers[])
    .filter((u) => !u.deleted_at)
    .map((u) => ({ qty: u.qty, eater_name: u.partners?.name ?? null, at: u.at }));

  const totals = {
    sold: sales.reduce((s, r) => s + r.qty, 0),
    sold_amount: round2(sales.reduce((s, r) => s + r.sold_amount, 0)),
    received: round2(sales.reduce((s, r) => s + r.amount_received, 0)),
    due: round2(sales.reduce((s, r) => s + r.due_amount, 0)),
    adjusted: adjustments.reduce((s, r) => s + r.qty, 0),
    personal: personal.reduce((s, r) => s + r.qty, 0),
  };

  return { sales, byCustomer, byMethod, adjustments, personal, totals };
}

export async function fetchOpenSummaries(): Promise<{ chalan_id: string; code: string; remaining: number; pcs_per_packet_hint: number }[]> {
  const { data, error } = await supabase.from('v_chalan_summary').select('*').eq('status', 'open');
  if (error) throw error;
  return ((data ?? []) as { chalan_id: string; code: string; remaining: number }[]).map((x) => ({ ...x, pcs_per_packet_hint: 20 }));
}
