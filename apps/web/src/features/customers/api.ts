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

export type CustomerSaleRow = { sold_at: string; qty: number; amount_received: number; due_amount: number; chalan_codes: string[] };
export type CustomerDetail = {
  sales: CustomerSaleRow[];
  byChalan: { code: string; pcs: number; paid: number }[];
  byMethod: { type: string; amount: number }[];
  totalPcs: number;
  totalPaid: number;
};

export async function fetchCustomerDetails(customerId: string, wallets: WalletRow[]): Promise<CustomerDetail> {
  const [salesRes, payRes] = await Promise.all([
    supabase
      .from('sales')
      .select('sold_at, qty, amount_received, due_amount, wallet_account_id, sale_allocations(qty, packets(chalan_id, chalans(code))), sale_receives(wallet_account_id, amount)')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('sold_at', { ascending: false }),
    supabase.from('customer_payments').select('amount, wallet_account_id').eq('customer_id', customerId).is('deleted_at', null),
  ]);
  if (salesRes.error) throw salesRes.error;
  type RawSale = { sold_at: string; qty: number; amount_received: string | number; due_amount: string | number; wallet_account_id: string; sale_allocations: { qty: number; packets: { chalan_id: string; chalans: { code: string } | null } | null }[] | null; sale_receives: { wallet_account_id: string; amount: string | number }[] | null };
  type RawPay = { amount: string | number; wallet_account_id: string };
  const raw = (salesRes.data ?? []) as unknown as RawSale[];
  const pays = (payRes.data ?? []) as unknown as RawPay[];
  const methodOf = (id: string | null | undefined) => wallets.find((w) => w.id === id)?.type ?? 'other';
  const byChalan = new Map<string, { code: string; pcs: number; paid: number }>();
  const byMethod = new Map<string, number>();
  const addPcs = (code: string, pcs: number, paid: number) => {
    const cur = byChalan.get(code) ?? { code, pcs: 0, paid: 0 };
    cur.pcs += pcs;
    cur.paid += paid;
    byChalan.set(code, cur);
  };
  const addMethod = (type: string, amount: number) => byMethod.set(type, (byMethod.get(type) ?? 0) + amount);

  const sales = raw.map((s) => {
    const received = Number(s.amount_received);
    const codes: string[] = [];
    for (const a of s.sale_allocations ?? []) {
      const code = a.packets?.chalans?.code;
      if (!code) continue;
      codes.push(code);
      addPcs(code, a.qty, (received * a.qty) / s.qty);
    }
    if (!(s.sale_receives ?? []).length && s.wallet_account_id) addMethod(methodOf(s.wallet_account_id), received);
    for (const r of s.sale_receives ?? []) addMethod(methodOf(r.wallet_account_id), Number(r.amount));
    codes.sort();
    return { sold_at: s.sold_at, qty: s.qty, amount_received: received, due_amount: Number(s.due_amount), chalan_codes: codes };
  });
  let paymentsTotal = 0;
  for (const p of pays) {
    paymentsTotal += Number(p.amount);
    addMethod(methodOf(p.wallet_account_id), Number(p.amount));
  }
  const sortMoney = (a: [string, number], b: [string, number]) => b[1] - a[1];
  return {
    sales,
    byChalan: [...byChalan.values()].sort((a, b) => b.pcs - a.pcs),
    byMethod: [...byMethod.entries()].sort(sortMoney).map(([type, amount]) => ({ type, amount })),
    totalPcs: sales.reduce((s, x) => s + x.qty, 0),
    totalPaid: sales.reduce((s, x) => s + x.amount_received, 0) + paymentsTotal,
  };
}
