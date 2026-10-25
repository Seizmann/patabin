import { supabase } from 'lib/supabase';

export type BatchRow = {
  id: string;
  code: string;
  purchase_date: string;
  status: string;
  note: string | null;
  pcs_per_packet: number | null;
  total_pcs?: number;
  remaining?: number;
  revenue?: number;
  profit?: number | null;
  landed_cost_per_pc?: number | null;
};

export type PayoutRow = { batch_id: string; partner_id: string; partner_name: string; contribution: number; contribution_share: number; personal_value: number; payout: number };
export type ContributionRow = { id: string; batch_id: string; partner_id: string; qty: number; amount_paid: string | number };
export type ExpenseRow = { id: string; batch_id: string; spent_on: string; category: string; cost_type: string; amount: string | number; paid_by_partner_id: string | null; funding: string; note: string | null };
export type AdjustmentRow = { id: string; batch_id: string; adjusted_on: string; qty: number; reason: string; note: string | null };

const ERRORS: Record<string, string> = {
  NOT_ACTIVE: 'আপনার অ্যাকাউন্ট নিষ্ক্রিয়।',
  CHANGE_PASSWORD_REQUIRED: 'প্রথমে পাসওয়ার্ড পরিবর্তন করুন।',
  STOCK_LEFT: 'স্টক বাকি আছে; আগে নষ্ট/ক্ষতি হিসেবে লিখুন।',
  BATCH_ALREADY_CLOSED: 'ব্যাচটি আগেই বন্ধ।',
  BATCH_NOT_CLOSED: 'ব্যাচটি বন্ধ নয়।',
  BATCH_NOT_FOUND: 'ব্যাচ পাওয়া যায়নি।',
  BATCH_NO_CONTRIBUTIONS: 'অন্তত এক পার্টনারের কেনা দিন।',
  BATCH_CONTRIBUTION_INVALID: 'কেনার তথ্য ঠিক নয়।',
  BATCH_EXPENSE_INVALID: 'খরচের তথ্য ঠিক নয়।',
};

export function mapError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = Object.keys(ERRORS).find((k) => msg.includes(k));
  return code ? ERRORS[code]! : 'সমস্যা হয়েছে; আবার চেষ্টা করুন।';
}

export async function fetchBatches(): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from('batches')
    .select('id, code, purchase_date, status, note, pcs_per_packet, v_batch_stock(remaining, total_pcs), v_batch_profit(revenue, profit)')
    .order('purchase_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b: Record<string, unknown>) => ({
    ...(b as unknown as BatchRow),
    remaining: singleNum(b.v_batch_stock, 'remaining'),
    total_pcs: singleNum(b.v_batch_stock, 'total_pcs'),
    revenue: singleNum(b.v_batch_profit, 'revenue'),
    profit: singleNum(b.v_batch_profit, 'profit'),
  })) as BatchRow[];
}

function singleNum(rel: unknown, key: string): number | undefined {
  const arr = Array.isArray(rel) ? (rel[0] as Record<string, unknown> | undefined) : undefined;
  if (!arr) return undefined;
  const v = arr[key];
  return v === null || v === undefined ? undefined : Number(v);
}

export async function fetchBatchDetail(code: string) {
  const { data: batch, error } = await supabase
    .from('batches')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  if (!batch) throw new Error('BATCH_NOT_FOUND');
  const id = batch.id;
  const [stock, summary, payouts, contributions, expenses, adjustments] = await Promise.all([
    supabase.from('v_batch_stock').select('*').eq('batch_id', id).maybeSingle(),
    supabase.from('v_batch_summary').select('*').eq('batch_id', id).maybeSingle(),
    supabase.from('v_partner_batch_payout').select('*').eq('batch_id', id),
    supabase.from('batch_contributions').select('*').eq('batch_id', id),
    supabase.from('expenses').select('*').eq('batch_id', id).order('spent_on', { ascending: false }),
    supabase.from('stock_adjustments').select('*').eq('batch_id', id).order('adjusted_on', { ascending: false }),
  ]);
  const thrown = [stock.error, summary.error, payouts.error, contributions.error, expenses.error, adjustments.error].find(Boolean);
  if (thrown) throw thrown;
  return {
    batch: batch as { id: string; code: string; purchase_date: string; status: string; note: string | null; pcs_per_packet: number | null },
    stock: stock.data ?? null,
    summary: summary.data ?? null,
    payouts: (payouts.data ?? []) as PayoutRow[],
    contributions: (contributions.data ?? []) as ContributionRow[],
    expenses: (expenses.data ?? []) as ExpenseRow[],
    adjustments: (adjustments.data ?? []) as AdjustmentRow[],
  };
}

export type BatchInput = {
  purchase_date?: string | null;
  unit_cost?: number | null;
  pcs_per_packet?: number | null;
  note?: string | null;
  contributions: { partner_id: string; qty: number; amount_paid?: number | null }[];
  expenses?: {
    spent_on?: string | null;
    paid_by_partner_id: string;
    amount: number;
    category: string;
    cost_type: string;
    funding: string;
    note?: string | null;
  }[];
};

export async function createBatch(input: BatchInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_batch', { p_batch: input });
  if (error) throw error;
  return String(data);
}

export async function closeBatch(id: string): Promise<void> {
  const { error } = await supabase.rpc('close_batch', { p_batch_id: id });
  if (error) throw error;
}

export async function reopenBatch(id: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_batch', { p_batch_id: id });
  if (error) throw error;
}
