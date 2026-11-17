import {
  DEMO_AUDIT_LOG,
  DEMO_CHALAN_PURCHASES,
  DEMO_CHALANS,
  DEMO_CUSTOMER_PAYMENTS,
  DEMO_CUSTOMERS,
  DEMO_EXPENSES,
  DEMO_EXPENSE_CATEGORIES,
  DEMO_PACKETS,
  DEMO_PARTNERS,
  DEMO_PERSONAL_USES,
  DEMO_SALES,
  DEMO_SALE_ALLOCATIONS,
  DEMO_SALE_RECEIVES,
  DEMO_SETTINGS,
  DEMO_STOCK_ADJUSTMENTS,
  DEMO_V_CHALAN_SUMMARY,
  DEMO_V_CUSTOMER_BALANCE,
  DEMO_V_PACKET_STOCK,
  DEMO_V_PARTNER_BALANCE,
  DEMO_V_PARTNER_CHALAN_SETTLEMENT,
  DEMO_WALLETS,
  DEMO_WALLET_TRANSFERS,
  DEMO_WITHDRAWALS,
  DEMO_CUSTOMER_PAYMENT_ALLOCATIONS,
  demoDashboardTotals,
  demoIncomeBreakdown,
  demoPartnerSellSummary,
  demoWalletFlows,
} from 'lib/demo-data';

type Row = Record<string, unknown>;
type Filter = { op: string; col: string; val: unknown };

const READ_ONLY_ERROR = { code: '42501', message: 'DEMO_READ_ONLY', details: null, hint: null };

const DEMO_UID = 'd3bd0000-1111-4222-8333-444455556666';

const TABLES: Record<string, Row[]> = {
  profiles: [{ id: DEMO_UID, role: 'patabin_demo_admin', display_name: 'Demo Admin', must_change_password: false, is_active: true, created_at: '2026-01-01T00:00:00Z' }],
  chalans: DEMO_CHALANS as unknown as Row[],
  chalan_purchases: DEMO_CHALAN_PURCHASES as unknown as Row[],
  packets: DEMO_PACKETS as unknown as Row[],
  v_packet_stock: DEMO_V_PACKET_STOCK as unknown as Row[],
  sales: DEMO_SALES as unknown as Row[],
  v_sales_enriched: DEMO_SALES as unknown as Row[],
  sale_allocations: DEMO_SALE_ALLOCATIONS as unknown as Row[],
  sale_receives: DEMO_SALE_RECEIVES as unknown as Row[],
  customers: DEMO_CUSTOMERS as unknown as Row[],
  v_customer_balance: DEMO_V_CUSTOMER_BALANCE as unknown as Row[],
  customer_payments: DEMO_CUSTOMER_PAYMENTS as unknown as Row[],
  customer_payment_allocations: DEMO_CUSTOMER_PAYMENT_ALLOCATIONS as unknown as Row[],
  expense_categories: DEMO_EXPENSE_CATEGORIES as unknown as Row[],
  expenses: DEMO_EXPENSES as unknown as Row[],
  personal_uses: DEMO_PERSONAL_USES as unknown as Row[],
  stock_adjustments: DEMO_STOCK_ADJUSTMENTS as unknown as Row[],
  wallets: DEMO_WALLETS as unknown as Row[],
  wallet_transfers: DEMO_WALLET_TRANSFERS as unknown as Row[],
  withdrawals: DEMO_WITHDRAWALS as unknown as Row[],
  v_wallet_balance: [],
  v_partner_balance: DEMO_V_PARTNER_BALANCE as unknown as Row[],
  v_partner_chalan_settlement: DEMO_V_PARTNER_CHALAN_SETTLEMENT as unknown as Row[],
  v_chalan_summary: DEMO_V_CHALAN_SUMMARY as unknown as Row[],
  partners: DEMO_PARTNERS as unknown as Row[],
  settings: [DEMO_SETTINGS] as unknown as Row[],
  audit_log: DEMO_AUDIT_LOG as unknown as Row[],
};

const RPC_WRITES = new Set([
  'create_sale', 'update_sale', 'delete_sale', 'create_chalan', 'close_chalan', 'reopen_chalan',
  'adjust_chalan_purchase', 'create_packets', 'set_sell_priority', 'create_expense', 'update_expense',
  'delete_expense', 'create_personal_use', 'create_adjustment', 'create_transfer', 'create_withdrawal',
  'create_customer_payment',
]);

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function matchFilter(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case 'eq': return v === f.val || String(v) === String(f.val);
    case 'neq': return !(v === f.val || String(v) === String(f.val));
    case 'gt': return compare(v, f.val) > 0;
    case 'gte': return compare(v, f.val) >= 0;
    case 'lt': return compare(v, f.val) < 0;
    case 'lte': return compare(v, f.val) <= 0;
    case 'is': return f.val === null ? v === null || v === undefined : v === f.val;
    case 'in': return Array.isArray(f.val) && (f.val as unknown[]).some((x) => String(x) === String(v));
    case 'like':
    case 'ilike': return String(v ?? '').toLowerCase().includes(String(f.val).replaceAll('%', '').toLowerCase());
    default: return true;
  }
}

function parseOr(row: Row, expr: string): boolean {
  return expr.split(',').some((cond) => {
    const [col = '', op = '', ...rest] = cond.split('.');
    return matchFilter(row, { op, col: col.trim(), val: rest.join('.').trim() });
  });
}

export type DemoResult = { data: unknown; error: typeof READ_ONLY_ERROR | null; count: number | null };

class DemoQuery {
  private rows: Row[];
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private fromIdx = 0;
  private toIdx = Number.MAX_SAFE_INTEGER;
  private wantCount = false;

  constructor(rows: Row[]) {
    this.rows = rows;
  }

  select(_cols?: string, opts?: { count?: string }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }

  eq(col: string, val: unknown) { this.filters.push({ op: 'eq', col, val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ op: 'neq', col, val }); return this; }
  gt(col: string, val: unknown) { this.filters.push({ op: 'gt', col, val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ op: 'gte', col, val }); return this; }
  lt(col: string, val: unknown) { this.filters.push({ op: 'lt', col, val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ op: 'lte', col, val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ op: 'is', col, val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ op: 'in', col, val }); return this; }
  like(col: string, val: string) { this.filters.push({ op: 'like', col, val }); return this; }
  ilike(col: string, val: string) { this.filters.push({ op: 'ilike', col, val }); return this; }
  not(col: string, op: string, val: unknown) { this.filters.push({ op: `not_${op}`, col, val }); return this; }
  or(expr: string) { this.filters.push({ op: 'or', col: '', val: expr }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true });
    return this;
  }

  range(from: number, to: number) {
    this.fromIdx = from;
    this.toIdx = to;
    return this;
  }

  limit(n: number) {
    this.toIdx = Math.min(this.toIdx, n - 1);
    return this;
  }

  abortSignal() {
    return this;
  }

  single() {
    const rows = this.execute();
    return Promise.resolve(
      rows.length > 0
        ? { data: rows[0], error: null, count: null, status: 200, statusText: 'OK' }
        : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null, hint: null }, count: null, status: 406, statusText: 'Not Acceptable' },
    );
  }

  maybeSingle() {
    const rows = this.execute();
    return Promise.resolve({ data: rows[0] ?? null, error: null, count: null, status: 200, statusText: 'OK' });
  }

  private execute(): Row[] {
    let rows = this.rows.filter((row) =>
      this.filters.every((f) => {
        if (f.op === 'or') return parseOr(row, f.val as string);
        if (f.op.startsWith('not_')) return !matchFilter(row, { op: f.op.slice(4), col: f.col, val: f.val });
        return matchFilter(row, f);
      }),
    );
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => (o.asc ? compare(a[o.col], b[o.col]) : compare(b[o.col], a[o.col])));
    }
    return rows.slice(this.fromIdx, this.toIdx + 1);
  }

  then<TResult1 = DemoResult, TResult2 = never>(
    onfulfilled?: ((value: DemoResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const rows = this.execute();
    const result: DemoResult = { data: rows, error: null, count: this.wantCount ? rows.length : null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

class DemoWriteQuery {
  select() { return this; }
  eq() { return this; }
  neq() { return this; }
  single() { return this; }
  maybeSingle() { return this; }
  then<TResult1 = { data: null; error: typeof READ_ONLY_ERROR }, TResult2 = never>(
    onfulfilled?: ((value: { data: null; error: typeof READ_ONLY_ERROR }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: null, error: READ_ONLY_ERROR }).then(onfulfilled, onrejected);
  }
}

export function demoFrom(table: string) {
  return new DemoQuery(TABLES[table] ?? []);
}

export function demoRpc(fn: string, args?: Record<string, unknown>) {
  if (RPC_WRITES.has(fn)) return new DemoWriteQuery();
  let data: unknown = null;
  if (fn === 'dashboard_totals') data = demoDashboardTotals(String(args?.p_start), String(args?.p_end));
  else if (fn === 'income_by_period_breakdown') data = demoIncomeBreakdown(String(args?.p_start), String(args?.p_end));
  else if (fn === 'partner_sell_summary') data = demoPartnerSellSummary(String(args?.p_start), String(args?.p_end));
  else if (fn === 'wallet_flows') data = demoWalletFlows(String(args?.p_start), String(args?.p_end));
  else if (fn === 'server_now') data = new Date().toISOString();
  else if (fn === 'my_permissions') data = [];
  return Promise.resolve({ data, error: null, count: null });
}
