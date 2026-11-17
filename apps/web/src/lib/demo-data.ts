const now = Date.now();

function daysAgo(n: number, h = 10, m = 0): string {
  const d = new Date(now - n * 86400000);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const P1 = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
export const DEMO_UID = 'd3bd0000-1111-4222-8333-444455556666';
const W_CASH = '20000000-0000-4000-8000-000000000001';
const W_BKASH = '20000000-0000-4000-8000-000000000002';
const W_NAGAD = '20000000-0000-4000-8000-000000000003';
const W_ROCKET = '20000000-0000-4000-8000-000000000004';
const C1 = '30000000-0000-4000-8000-000000000001';
const C2 = '30000000-0000-4000-8000-000000000002';
const C3 = '30000000-0000-4000-8000-000000000003';

const BUY_RATE = 190;
const SELL_PRICE = 300;

export const DEMO_WALLETS = [
  { id: W_CASH, type: 'cash', name: '', label: 'ক্যাশ', is_active: true, created_at: daysAgo(90) },
  { id: W_BKASH, type: 'bkash', name: '01712-345678', label: 'বিকাশ', is_active: true, created_at: daysAgo(90) },
  { id: W_NAGAD, type: 'nagad', name: '01812-345678', label: 'নগদ', is_active: true, created_at: daysAgo(90) },
  { id: W_ROCKET, type: 'rocket', name: '01912-345678', label: 'রকেট', is_active: false, created_at: daysAgo(90) },
];

export const DEMO_PARTNERS = [
  { id: P1, name: 'রাকিব হাসান', user_id: DEMO_UID, deleted_at: null, created_at: daysAgo(90) },
  { id: P2, name: 'তানভীর আহমেদ', user_id: null, deleted_at: null, created_at: daysAgo(90) },
];

const chalanRows = [
  { id: C1, code: 'C-001', purchase_date: daysAgo(60, 9), closed_at: daysAgo(38, 20), buy_rate: 185, pcs_per_packet: 20, status: 'closed', note: 'প্রথম চালান', created_by: 'demo', deleted_at: null, created_at: daysAgo(60) },
  { id: C2, code: 'C-002', purchase_date: daysAgo(32, 9), closed_at: daysAgo(15, 20), buy_rate: 190, pcs_per_packet: 20, status: 'closed', note: null, created_by: 'demo', deleted_at: null, created_at: daysAgo(32) },
  { id: C3, code: 'C-003', purchase_date: daysAgo(12, 9), closed_at: null, buy_rate: 190, pcs_per_packet: 20, status: 'open', note: 'চলতি স্টক', created_by: 'demo', deleted_at: null, created_at: daysAgo(12) },
];

export const DEMO_CHALANS = chalanRows;

export const DEMO_CHALAN_PURCHASES = [
  { id: '31000000-0000-4000-8000-000000000001', chalan_id: C1, partner_id: P1, qty: 200, amount_paid: 37000, created_by: 'demo', deleted_at: null, created_at: daysAgo(60) },
  { id: '31000000-0000-4000-8000-000000000002', chalan_id: C1, partner_id: P2, qty: 100, amount_paid: 18500, created_by: 'demo', deleted_at: null, created_at: daysAgo(60) },
  { id: '31000000-0000-4000-8000-000000000003', chalan_id: C2, partner_id: P1, qty: 160, amount_paid: 30400, created_by: 'demo', deleted_at: null, created_at: daysAgo(32) },
  { id: '31000000-0000-4000-8000-000000000004', chalan_id: C2, partner_id: P2, qty: 80, amount_paid: 15200, created_by: 'demo', deleted_at: null, created_at: daysAgo(32) },
  { id: '31000000-0000-4000-8000-000000000005', chalan_id: C3, partner_id: P1, qty: 60, amount_paid: 11400, created_by: 'demo', deleted_at: null, created_at: daysAgo(12) },
  { id: '31000000-0000-4000-8000-000000000006', chalan_id: C3, partner_id: P2, qty: 60, amount_paid: 11400, created_by: 'demo', deleted_at: null, created_at: daysAgo(12) },
];

type PacketSeed = { chalan_id: string; code: string; owner: string; total: number; remaining: number; pos: number; days: number };

const packetSeeds: PacketSeed[] = [
  { chalan_id: C1, code: 'P-001', owner: P1, total: 20, remaining: 0, pos: 11, days: 60 },
  { chalan_id: C1, code: 'P-002', owner: P1, total: 20, remaining: 0, pos: 12, days: 60 },
  { chalan_id: C1, code: 'P-003', owner: P2, total: 20, remaining: 0, pos: 13, days: 60 },
  { chalan_id: C1, code: 'P-004', owner: P2, total: 20, remaining: 0, pos: 14, days: 60 },
  { chalan_id: C2, code: 'P-005', owner: P1, total: 20, remaining: 0, pos: 7, days: 32 },
  { chalan_id: C2, code: 'P-006', owner: P1, total: 20, remaining: 0, pos: 8, days: 32 },
  { chalan_id: C2, code: 'P-007', owner: P1, total: 20, remaining: 0, pos: 9, days: 32 },
  { chalan_id: C2, code: 'P-008', owner: P2, total: 20, remaining: 0, pos: 10, days: 32 },
  { chalan_id: C3, code: 'P-101', owner: P1, total: 20, remaining: 2, pos: 1, days: 12 },
  { chalan_id: C3, code: 'P-102', owner: P1, total: 20, remaining: 7, pos: 2, days: 12 },
  { chalan_id: C3, code: 'P-103', owner: P1, total: 20, remaining: 8, pos: 3, days: 12 },
  { chalan_id: C3, code: 'P-104', owner: P2, total: 20, remaining: 9, pos: 4, days: 12 },
  { chalan_id: C3, code: 'P-105', owner: P2, total: 20, remaining: 8, pos: 5, days: 12 },
  { chalan_id: C3, code: 'P-106', owner: P2, total: 20, remaining: 12, pos: 6, days: 12 },
];

export const DEMO_PACKETS = packetSeeds.map((p, i) => ({
  id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  chalan_id: p.chalan_id,
  code: p.code,
  owner_partner_id: p.owner,
  total_pcs: p.total,
  packed_at: daysAgo(p.days, 11),
  created_by: 'demo',
  deleted_at: null,
  created_at: daysAgo(p.days),
}));

export const DEMO_V_PACKET_STOCK = packetSeeds.map((p, i) => ({
  packet_id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  chalan_id: p.chalan_id,
  chalan_code: chalanRows.find((c) => c.id === p.chalan_id)!.code,
  chalan_status: chalanRows.find((c) => c.id === p.chalan_id)!.status,
  packet_code: p.code,
  owner_partner_id: p.owner,
  owner_name: p.owner === P1 ? 'রাকিব হাসান' : 'তানভীর আহমেদ',
  total_pcs: p.total,
  remaining: p.remaining,
  position: p.pos,
}));

type CustomerSeed = { id: string; name: string; phone: string };

export const DEMO_CUSTOMERS: (CustomerSeed & { deleted_at: null; created_at: string })[] = [
  { id: '50000000-0000-4000-8000-000000000001', name: 'করিম উদ্দিন', phone: '01711-111111', deleted_at: null, created_at: daysAgo(55) },
  { id: '50000000-0000-4000-8000-000000000002', name: 'সেলিম মোল্লা', phone: '01722-222222', deleted_at: null, created_at: daysAgo(50) },
  { id: '50000000-0000-4000-8000-000000000003', name: 'রফিক স্টোর', phone: '01733-333333', deleted_at: null, created_at: daysAgo(45) },
  { id: '50000000-0000-4000-8000-000000000004', name: 'জাহিদ হোসেন', phone: '01744-444444', deleted_at: null, created_at: daysAgo(30) },
  { id: '50000000-0000-4000-8000-000000000005', name: 'মিলন ট্রেডার্স', phone: '01755-555555', deleted_at: null, created_at: daysAgo(20) },
];

type SaleSeed = {
  id: string;
  days: number;
  hour: number;
  qty: number;
  received: number;
  due: number;
  customer: CustomerSeed | null;
  wallet: string;
  packets: string;
  owners: string;
  note: string | null;
};

const saleSeeds: SaleSeed[] = [
  { id: '60000000-0000-4000-8000-000000000001', days: 11, hour: 11, qty: 6, received: 1800, due: 0, customer: null, wallet: W_CASH, packets: 'C-003/P-101', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000002', days: 10, hour: 15, qty: 4, received: 1200, due: 0, customer: null, wallet: W_BKASH, packets: 'C-003/P-101', owners: 'রাকিব হাসান', note: 'দোকান ডেলিভারি' },
  { id: '60000000-0000-4000-8000-000000000003', days: 9, hour: 12, qty: 8, received: 2200, due: 200, customer: DEMO_CUSTOMERS[0]!, wallet: W_CASH, packets: 'C-003/P-102', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000004', days: 8, hour: 17, qty: 3, received: 900, due: 0, customer: null, wallet: W_NAGAD, packets: 'C-003/P-104', owners: 'তানভীর আহমেদ', note: null },
  { id: '60000000-0000-4000-8000-000000000005', days: 7, hour: 10, qty: 10, received: 2900, due: 100, customer: DEMO_CUSTOMERS[2]!, wallet: W_BKASH, packets: 'C-003/P-105', owners: 'তানভীর আহমেদ', note: 'পাইকারি রেট' },
  { id: '60000000-0000-4000-8000-000000000006', days: 6, hour: 14, qty: 5, received: 1500, due: 0, customer: null, wallet: W_CASH, packets: 'C-003/P-102', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000007', days: 5, hour: 11, qty: 2, received: 600, due: 0, customer: null, wallet: W_NAGAD, packets: 'C-003/P-106', owners: 'তানভীর আহমেদ', note: null },
  { id: '60000000-0000-4000-8000-000000000008', days: 4, hour: 16, qty: 12, received: 3400, due: 200, customer: DEMO_CUSTOMERS[4]!, wallet: W_BKASH, packets: 'C-003/P-103', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000009', days: 3, hour: 12, qty: 7, received: 2100, due: 0, customer: null, wallet: W_CASH, packets: 'C-003/P-104', owners: 'তানভীর আহমেদ', note: null },
  { id: '60000000-0000-4000-8000-000000000010', days: 2, hour: 18, qty: 5, received: 1200, due: 300, customer: DEMO_CUSTOMERS[1]!, wallet: W_BKASH, packets: 'C-003/P-106', owners: 'তানভীর আহমেদ', note: 'বাকি আছে' },
  { id: '60000000-0000-4000-8000-000000000011', days: 1, hour: 13, qty: 6, received: 1800, due: 0, customer: null, wallet: W_NAGAD, packets: 'C-003/P-101', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000012', days: 25, hour: 12, qty: 8, received: 2400, due: 0, customer: DEMO_CUSTOMERS[3]!, wallet: W_CASH, packets: 'C-002/P-005', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000013', days: 28, hour: 15, qty: 6, received: 1800, due: 0, customer: null, wallet: W_BKASH, packets: 'C-002/P-006', owners: 'রাকিব হাসান', note: null },
  { id: '60000000-0000-4000-8000-000000000014', days: 50, hour: 11, qty: 10, received: 3000, due: 0, customer: DEMO_CUSTOMERS[0]!, wallet: W_CASH, packets: 'C-001/P-001', owners: 'রাকিব হাসান', note: null },
];

function walletInfo(id: string) {
  const w = DEMO_WALLETS.find((x) => x.id === id)!;
  return { type: w.type, name: w.name, label: w.label };
}

const packetIdByCode = new Map(packetSeeds.map((p, i) => [p.code, `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
const partnerName = (id: string) => (id === P1 ? 'রাকিব হাসান' : 'তানভীর আহমেদ');

export const DEMO_SALES = saleSeeds.map((s) => {
  const gross = s.qty * SELL_PRICE;
  const received = s.received;
  const discount = gross - received - s.due;
  const w = walletInfo(s.wallet);
  const [, packetCode = ''] = s.packets.split('/');
  return {
    id: s.id,
    sold_at: daysAgo(s.days, s.hour),
    qty: s.qty,
    list_unit_price: SELL_PRICE,
    amount_received: received,
    due_amount: s.due,
    discount,
    discount_pct: discount > 0 ? Math.round((discount / gross) * 100) : null,
    customer_id: s.customer?.id ?? null,
    customer_name: s.customer?.name ?? null,
    customer_phone: s.customer?.phone ?? null,
    wallet_account_id: s.wallet,
    wallet_type: w.type,
    wallet_name: w.name,
    wallet_label: w.label,
    wallet_details: w.name ? `${w.label} ${w.name}` : w.label,
    note: s.note,
    created_by: 'demo',
    created_at: daysAgo(s.days, s.hour),
    deleted_at: null,
    packet_codes: s.packets,
    owner_names: s.owners,
    sale_allocations: [{ packet_id: packetIdByCode.get(packetCode), qty: s.qty }],
    sale_receives: [{ wallet_account_id: s.wallet, amount: received }],
  };
});

export const DEMO_SALE_ALLOCATIONS = saleSeeds.map((s, i) => {
  const [chalanCode = '', packetCode = ''] = s.packets.split('/');
  const seed = packetSeeds.find((p) => p.code === packetCode)!;
  const w = walletInfo(s.wallet);
  return {
    id: `65000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    sale_id: s.id,
    packet_id: packetIdByCode.get(packetCode),
    qty: s.qty,
    created_at: daysAgo(s.days, s.hour),
    packets: { code: packetCode, partners: { name: partnerName(seed.owner) }, chalans: { code: chalanCode } },
    sales: {
      id: s.id,
      qty: s.qty,
      sold_at: daysAgo(s.days, s.hour),
      list_unit_price: SELL_PRICE,
      customer_id: s.customer?.id ?? null,
      customer_name: s.customer?.name ?? null,
      customer_phone: s.customer?.phone ?? null,
      amount_received: s.received,
      due_amount: s.due,
      deleted_at: null,
      sale_receives: [{ amount: s.received, wallets: { type: w.type, name: w.name, label: w.label } }],
    },
  };
});

export const DEMO_SALE_RECEIVES = saleSeeds.map((s, i) => {
  const w = walletInfo(s.wallet);
  return {
    id: `66000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    sale_id: s.id,
    wallet_account_id: s.wallet,
    amount: s.received,
    created_by: 'demo',
    created_at: daysAgo(s.days, s.hour),
    wallets: { type: w.type, name: w.name, label: w.label },
  };
});

export const DEMO_V_CUSTOMER_BALANCE = [
  { customer_id: '50000000-0000-4000-8000-000000000001', name: 'করিম উদ্দিন', phone: '01711-111111', balance: 0 },
  { customer_id: '50000000-0000-4000-8000-000000000002', name: 'সেলিম মোল্লা', phone: '01722-222222', balance: 300 },
  { customer_id: '50000000-0000-4000-8000-000000000003', name: 'রফিক স্টোর', phone: '01733-333333', balance: 100 },
  { customer_id: '50000000-0000-4000-8000-000000000004', name: 'জাহিদ হোসেন', phone: '01744-444444', balance: 0 },
  { customer_id: '50000000-0000-4000-8000-000000000005', name: 'মিলন ট্রেডার্স', phone: '01755-555555', balance: 200 },
];

export const DEMO_CUSTOMER_PAYMENTS = [
  {
    id: '90000000-0000-4000-8000-000000000001',
    customer_id: '50000000-0000-4000-8000-000000000001',
    amount: 200,
    wallet_account_id: W_BKASH,
    at: daysAgo(6, 19),
    note: 'বাকি মেটানো',
    created_by: 'demo',
    deleted_at: null,
    created_at: daysAgo(6),
    customer_payment_allocations: [{ sale_id: '60000000-0000-4000-8000-000000000003', amount: 200 }],
  },
  {
    id: '90000000-0000-4000-8000-000000000002',
    customer_id: '50000000-0000-4000-8000-000000000004',
    amount: 100,
    wallet_account_id: W_CASH,
    at: daysAgo(27, 20),
    note: null,
    created_by: 'demo',
    deleted_at: null,
    created_at: daysAgo(27),
    customer_payment_allocations: [],
  },
];

export const DEMO_CUSTOMER_PAYMENT_ALLOCATIONS = [
  {
    id: '91000000-0000-4000-8000-000000000001',
    payment_id: '90000000-0000-4000-8000-000000000001',
    sale_id: '60000000-0000-4000-8000-000000000003',
    packet_id: packetIdByCode.get('P-102'),
    amount: 200,
    customer_payments: {
      at: daysAgo(6, 19),
      deleted_at: null,
      wallets: { type: 'bkash', name: '01712-345678', label: 'বিকাশ' },
    },
  },
  {
    id: '91000000-0000-4000-8000-000000000002',
    payment_id: '90000000-0000-4000-8000-000000000002',
    sale_id: '60000000-0000-4000-8000-000000000012',
    packet_id: packetIdByCode.get('P-005'),
    amount: 100,
    customer_payments: {
      at: daysAgo(27, 20),
      deleted_at: null,
      wallets: { type: 'cash', name: '', label: 'ক্যাশ' },
    },
  },
];

export const DEMO_EXPENSE_CATEGORIES = [
  { id: '75000000-0000-4000-8000-000000000001', name: 'ট্রান্সপোর্ট', created_at: daysAgo(90) },
  { id: '75000000-0000-4000-8000-000000000002', name: 'সিগারেট', created_at: daysAgo(90) },
  { id: '75000000-0000-4000-8000-000000000003', name: 'মোবাইল রিচার্জ', created_at: daysAgo(90) },
  { id: '75000000-0000-4000-8000-000000000004', name: 'অন্যান্য', created_at: daysAgo(90) },
  { id: '75000000-0000-4000-8000-000000000005', name: 'বিদ্যুৎ বিল', created_at: daysAgo(40) },
];

export const DEMO_EXPENSES = [
  { id: '70000000-0000-4000-8000-000000000001', category_id: '75000000-0000-4000-8000-000000000001', amount: 350, paid_by_partner_id: P1, attributed_to_partner_id: P1, wallet_account_id: W_CASH, chalan_id: C3, note: 'ভ্যান ভাড়া', spent_at: daysAgo(11, 12), created_by: 'demo', deleted_at: null, created_at: daysAgo(11) },
  { id: '70000000-0000-4000-8000-000000000002', category_id: '75000000-0000-4000-8000-000000000003', amount: 100, paid_by_partner_id: P2, attributed_to_partner_id: P2, wallet_account_id: W_BKASH, chalan_id: C3, note: null, spent_at: daysAgo(10, 9), created_by: 'demo', deleted_at: null, created_at: daysAgo(10) },
  { id: '70000000-0000-4000-8000-000000000003', category_id: '75000000-0000-4000-8000-000000000001', amount: 280, paid_by_partner_id: P2, attributed_to_partner_id: P2, wallet_account_id: null, chalan_id: C3, note: 'রিকশা', spent_at: daysAgo(8, 18), created_by: 'demo', deleted_at: null, created_at: daysAgo(8) },
  { id: '70000000-0000-4000-8000-000000000004', category_id: '75000000-0000-4000-8000-000000000004', amount: 500, paid_by_partner_id: P1, attributed_to_partner_id: P1, wallet_account_id: W_CASH, chalan_id: C2, note: 'প্যাকেট ব্যাগ', spent_at: daysAgo(30, 14), created_by: 'demo', deleted_at: null, created_at: daysAgo(30) },
  { id: '70000000-0000-4000-8000-000000000005', category_id: '75000000-0000-4000-8000-000000000005', amount: 920, paid_by_partner_id: P1, attributed_to_partner_id: P1, wallet_account_id: W_CASH, chalan_id: null, note: 'দোকানের বিল', spent_at: daysAgo(18, 20), created_by: 'demo', deleted_at: null, created_at: daysAgo(18) },
  { id: '70000000-0000-4000-8000-000000000006', category_id: '75000000-0000-4000-8000-000000000002', amount: 60, paid_by_partner_id: P2, attributed_to_partner_id: P2, wallet_account_id: null, chalan_id: C3, note: null, spent_at: daysAgo(4, 16), created_by: 'demo', deleted_at: null, created_at: daysAgo(4) },
  { id: '70000000-0000-4000-8000-000000000007', category_id: '75000000-0000-4000-8000-000000000001', amount: 400, paid_by_partner_id: P1, attributed_to_partner_id: P1, wallet_account_id: W_NAGAD, chalan_id: null, note: 'বাস ভাড়া', spent_at: daysAgo(2, 8), created_by: 'demo', deleted_at: null, created_at: daysAgo(2) },
];

export const DEMO_PERSONAL_USES = [
  { id: '80000000-0000-4000-8000-000000000001', at: daysAgo(9, 21), qty: 2, unit_value: 300, note: null, packet_id: '40000000-0000-4000-8000-000000000009', chalan_id: C3, eater_partner_id: P1, created_by: 'demo', deleted_at: null, created_at: daysAgo(9), partners: { name: 'রাকিব হাসান' }, packets: { code: 'P-101', partners: { name: 'রাকিব হাসান' } }, chalans: { code: 'C-003' } },
  { id: '80000000-0000-4000-8000-000000000002', at: daysAgo(5, 20), qty: 1, unit_value: 300, note: 'উপহার', packet_id: '40000000-0000-4000-8000-000000000012', chalan_id: C3, eater_partner_id: P2, created_by: 'demo', deleted_at: null, created_at: daysAgo(5), partners: { name: 'তানভীর আহমেদ' }, packets: { code: 'P-104', partners: { name: 'তানভীর আহমেদ' } }, chalans: { code: 'C-003' } },
  { id: '80000000-0000-4000-8000-000000000003', at: daysAgo(29, 22), qty: 3, unit_value: 300, note: null, packet_id: '40000000-0000-4000-8000-000000000005', chalan_id: C2, eater_partner_id: P1, created_by: 'demo', deleted_at: null, created_at: daysAgo(29), partners: { name: 'রাকিব হাসান' }, packets: { code: 'P-005', partners: { name: 'রাকিব হাসান' } }, chalans: { code: 'C-002' } },
];

export const DEMO_STOCK_ADJUSTMENTS = [
  { id: '85000000-0000-4000-8000-000000000001', at: daysAgo(7, 12), packet_id: '40000000-0000-4000-8000-000000000010', qty: 2, reason: 'damage', person: null, note: 'গরমে গলে গেছে', created_by: 'demo', deleted_at: null, created_at: daysAgo(7), packets: { code: 'P-105', partners: { name: 'তানভীর আহমেদ' }, chalans: { code: 'C-003', buy_rate: 190 } } },
  { id: '85000000-0000-4000-8000-000000000002', at: daysAgo(6, 15), packet_id: '40000000-0000-4000-8000-000000000011', qty: 1, reason: 'sample', person: 'নতুন কাস্টমার', note: null, created_by: 'demo', deleted_at: null, created_at: daysAgo(6), packets: { code: 'P-106', partners: { name: 'তানভীর আহমেদ' }, chalans: { code: 'C-003', buy_rate: 190 } } },
  { id: '85000000-0000-4000-8000-000000000003', at: daysAgo(26, 11), packet_id: '40000000-0000-4000-8000-000000000007', qty: 1, reason: 'gift', person: 'শুভাকাঙ্ক্ষী', note: null, created_by: 'demo', deleted_at: null, created_at: daysAgo(26), packets: { code: 'P-008', partners: { name: 'তানভীর আহমেদ' }, chalans: { code: 'C-002', buy_rate: 190 } } },
];

export const DEMO_WALLET_TRANSFERS = [
  { id: '95000000-0000-4000-8000-000000000001', at: daysAgo(9, 20), from_wallet_id: W_BKASH, to_wallet_id: W_CASH, amount: 5000, charge: 10, attributed_to_partner_id: P1, note: 'ক্যাশে তোলা', created_by: 'demo', deleted_at: null, created_at: daysAgo(9) },
  { id: '95000000-0000-4000-8000-000000000002', at: daysAgo(3, 21), from_wallet_id: W_NAGAD, to_wallet_id: W_BKASH, amount: 2000, charge: 15, attributed_to_partner_id: P2, note: null, created_by: 'demo', deleted_at: null, created_at: daysAgo(3) },
];

export const DEMO_WITHDRAWALS = [
  { id: '96000000-0000-4000-8000-000000000001', at: daysAgo(14, 19), partner_id: P1, wallet_account_id: W_BKASH, amount: 8000, note: 'মাসিক উত্তোলন', created_by: 'demo', deleted_at: null, created_at: daysAgo(14) },
];

export const DEMO_V_PARTNER_BALANCE = [
  { partner_id: P1, partner_name: 'রাকিব হাসান', balance: 12560 },
  { partner_id: P2, partner_name: 'তানভীর আহমেদ', balance: 7340 },
];

export const DEMO_V_CHALAN_SUMMARY = chalanRows.map((c) => {
  const bought = DEMO_CHALAN_PURCHASES.filter((p) => p.chalan_id === c.id).reduce((s, p) => s + p.qty, 0);
  const remaining = DEMO_V_PACKET_STOCK.filter((p) => p.chalan_id === c.id).reduce((s, p) => s + p.remaining, 0);
  const expenses = DEMO_EXPENSES.filter((e) => e.chalan_id === c.id).reduce((s, e) => s + e.amount, 0);
  const sold = bought - remaining;
  return {
    chalan_id: c.id,
    code: c.code,
    status: c.status,
    purchase_date: c.purchase_date,
    closed_at: c.closed_at,
    buy_rate: c.buy_rate,
    pcs_per_packet: c.pcs_per_packet,
    bought_pcs: bought,
    packed_pcs: bought,
    remaining,
    sold_pcs: sold,
    capital: bought * c.buy_rate,
    expenses,
    profit: sold * (SELL_PRICE - c.buy_rate) - expenses,
  };
});

export const DEMO_V_PARTNER_CHALAN_SETTLEMENT = chalanRows.flatMap((c) => {
  const purchases = DEMO_CHALAN_PURCHASES.filter((p) => p.chalan_id === c.id);
  return purchases.map((p) => {
    const pcsOut = p.qty - DEMO_V_PACKET_STOCK.filter((s) => s.chalan_id === c.id && s.owner_partner_id === p.partner_id).reduce((s, x) => s + x.remaining, 0);
    const expenses = Math.round((DEMO_EXPENSES.filter((e) => e.chalan_id === c.id && e.attributed_to_partner_id === p.partner_id).reduce((s, e) => s + e.amount, 0)));
    const extRev = Math.round(pcsOut * SELL_PRICE * 0.8);
    const internalRev = pcsOut * c.buy_rate;
    const cost = pcsOut * c.buy_rate;
    const profit = extRev + internalRev - cost - expenses;
    return {
      chalan_id: c.id,
      partner_id: p.partner_id,
      partner_name: p.partner_id === P1 ? 'রাকিব হাসান' : 'তানভীর আহমেদ',
      capital: p.amount_paid,
      ext_rev: extRev,
      internal_rev: internalRev,
      cost,
      profit,
      consumption_due: 0,
      expenses_attributed: expenses,
      pocket_paid: 0,
      entitlement: profit,
      pcs_out: pcsOut,
    };
  });
});

export const DEMO_AUDIT_LOG = [
  { id: 3, at: daysAgo(1, 13), table_name: 'sales', row_id: '60000000-0000-4000-8000-000000000011', action: 'INSERT', old_data: null, new_data: { qty: 6, amount_received: 1800 } },
  { id: 2, at: daysAgo(2, 18), table_name: 'expenses', row_id: '70000000-0000-4000-8000-000000000007', action: 'INSERT', old_data: null, new_data: { amount: 400 } },
  { id: 1, at: daysAgo(12, 9), table_name: 'chalans', row_id: C3, action: 'INSERT', old_data: null, new_data: { code: 'C-003', buy_rate: 190 } },
];

export const DEMO_SETTINGS = { id: 1, default_buy_rate: BUY_RATE, default_sell_price: SELL_PRICE, default_packet_size: 20, updated_at: daysAgo(90) };

// ---------------------------------------------------------------------------
// RPC mocks
// ---------------------------------------------------------------------------

const inRange = (iso: string, start: string, end: string) => iso >= start && iso < end;

export function demoDashboardTotals(start: string, end: string) {
  const sales = DEMO_SALES.filter((s) => inRange(s.sold_at, start, end));
  const expenses = DEMO_EXPENSES.filter((e) => inRange(e.spent_at, start, end));
  const income = sales.reduce((s, x) => s + x.amount_received + x.due_amount, 0);
  const exp = expenses.reduce((s, x) => s + x.amount, 0);
  const realizedCost = sales.reduce((s, x) => s + x.qty * BUY_RATE, 0);
  const stock = DEMO_V_PACKET_STOCK.reduce((s, x) => s + x.remaining, 0);
  return {
    income,
    expenses: exp,
    discount_total: sales.reduce((s, x) => s + x.discount, 0),
    realized_cost: realizedCost,
    net_profit: income - realizedCost - exp,
    list_value: sales.reduce((s, x) => s + x.qty * x.list_unit_price, 0),
    cash_received: sales.reduce((s, x) => s + x.amount_received, 0),
    stock_current: stock,
  };
}

export function demoIncomeBreakdown(start: string, end: string) {
  const slices: { slice: string; amount: number }[] = [];
  for (const w of DEMO_WALLETS.filter((x) => x.is_active)) {
    const amount = DEMO_SALES.filter((s) => s.wallet_account_id === w.id && inRange(s.sold_at, start, end)).reduce((s, x) => s + x.amount_received, 0);
    if (amount > 0) slices.push({ slice: `${w.type}|${w.name}`, amount });
  }
  const personal = DEMO_PERSONAL_USES.filter((u) => inRange(u.at, start, end)).reduce((s, u) => s + u.qty * u.unit_value, 0);
  if (personal > 0) slices.push({ slice: 'personal|', amount: personal });
  return slices;
}

export function demoPartnerSellSummary(start: string, end: string) {
  const stock = DEMO_V_PACKET_STOCK;
  return DEMO_PARTNERS.map((p) => {
    const own = stock.filter((s) => s.owner_partner_id === p.id);
    const sellRevenue = DEMO_SALES.filter((s) => inRange(s.sold_at, start, end) && s.owner_names.includes(p.name)).reduce((s, x) => s + x.amount_received + x.due_amount, 0);
    const personalUse = DEMO_PERSONAL_USES.filter((u) => u.eater_partner_id === p.id && inRange(u.at, start, end)).reduce((s, u) => s + u.qty * u.unit_value, 0);
    const khoroch = DEMO_EXPENSES.filter((e) => e.attributed_to_partner_id === p.id && inRange(e.spent_at, start, end)).reduce((s, e) => s + e.amount, 0);
    return {
      partner_id: p.id,
      partner_name: p.name,
      sell_revenue: sellRevenue,
      personal_use: personalUse,
      khoroch,
      remaining_pcs: own.reduce((s, x) => s + x.remaining, 0),
      balance: sellRevenue - personalUse - khoroch,
    };
  });
}

export function demoWalletFlows(start: string, end: string) {
  return DEMO_WALLETS.filter((w) => w.is_active).map((w) => {
    const received = DEMO_SALES.filter((s) => s.wallet_account_id === w.id && inRange(s.sold_at, start, end)).reduce((s, x) => s + x.amount_received, 0);
    const payments = DEMO_CUSTOMER_PAYMENTS.filter((p) => p.wallet_account_id === w.id && inRange(p.at, start, end)).reduce((s, x) => s + x.amount, 0);
    const expenses = DEMO_EXPENSES.filter((e) => e.wallet_account_id === w.id && inRange(e.spent_at, start, end)).reduce((s, x) => s + x.amount, 0);
    const outTransfers = DEMO_WALLET_TRANSFERS.filter((t) => t.from_wallet_id === w.id && inRange(t.at, start, end)).reduce((s, x) => s + x.amount, 0);
    const inTransfers = DEMO_WALLET_TRANSFERS.filter((t) => t.to_wallet_id === w.id && inRange(t.at, start, end)).reduce((s, x) => s + x.amount - x.charge, 0);
    return { wallet_id: w.id, type: w.type, name: w.name, label: w.label, is_active: w.is_active, amount: received + payments + inTransfers - expenses - outTransfers };
  });
}
