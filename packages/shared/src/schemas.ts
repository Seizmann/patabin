import { z } from 'zod';

export const uid = z.string().uuid();
export const money = z.coerce.number().min(0);
export const pcs = z.coerce.number().int().min(1);

export const chalanItemSchema = z.object({
  partner_id: uid.min(1, 'পার্টনার বাছুন'),
  qty: pcs,
  amount_paid: money.optional(),
});
export const chalanSchema = z.object({
  purchase_date: z.string().nullish(),
  buy_rate: money,
  pcs_per_packet: pcs,
  note: z.string().nullish(),
  items: z.array(chalanItemSchema).min(1, 'অন্তত একজন পার্টনারের কেনা দিন'),
});

export const packItemSchema = z.object({ partner_id: uid.min(1, 'পার্টনার বাছুন'), pcs: pcs });
export const packSchema = z.object({
  chalan_id: uid,
  pcs_per_packet: pcs,
  packed_at: z.string().nullish(),
  items: z.array(packItemSchema).min(1, 'অন্তত একজন পার্টনারের পিস দিন'),
});

export const saleSchema = z.object({
  qty: pcs,
  list_unit_price: money,
  amount_received: money,
  customer_name: z.string().nullish(),
  customer_phone: z.string().nullish(),
  wallet_account_id: uid.min(1, 'কোথায় টাকা গেল বাছুন'),
  note: z.string().nullish(),
  sold_at: z.string().nullish(),
});
export const saleSchemaAllowZero = saleSchema.partial({ amount_received: true }).extend({ amount_received: money });

export const personalUseSchema = z.object({
  eater_partner_id: uid.min(1, 'কে খাচ্ছে বাছুন'),
  packet_id: uid.nullish(),
  chalan_id: uid.nullish(),
  qty: pcs,
  unit_value: money,
  note: z.string().nullish(),
  at: z.string().nullish(),
});

export const adjustmentSchema = z.object({
  packet_id: uid.min(1, 'প্যাকেট বাছুন'),
  qty: pcs,
  reason: z.enum(['gift', 'damage', 'loss', 'sample', 'other']),
  person: z.string().nullish(),
  note: z.string().nullish(),
  at: z.string().nullish(),
});

export const expenseSchema = z.object({
  category_id: uid.min(1, 'ক্যাটাগরি বাছুন'),
  amount: money.refine((n) => n > 0, 'টাকার পরিমাণ দিন'),
  paid_by_partner_id: uid.min(1, 'কে দিল বাছুন'),
  attributed_to_partner_id: uid.min(1, 'কার খরচ বাছুন'),
  wallet_account_id: uid.nullish(),
  chalan_id: uid.nullish(),
  note: z.string().nullish(),
  spent_at: z.string().nullish(),
});

export const withdrawalSchema = z.object({
  partner_id: uid.min(1, 'পার্টনার বাছুন'),
  wallet_account_id: uid.min(1, 'ওয়ালেট বাছুন'),
  amount: money.refine((n) => n > 0, 'টাকার পরিমাণ দিন'),
  note: z.string().nullish(),
  at: z.string().nullish(),
});

export const transferSchema = z.object({
  from_wallet_id: uid,
  to_wallet_id: uid,
  amount: money.refine((n) => n > 0, 'টাকার পরিমাণ দিন'),
  charge: money,
  attributed_to_partner_id: uid.min(1, 'কার জন্য বাছুন'),
  note: z.string().nullish(),
  at: z.string().nullish(),
});
