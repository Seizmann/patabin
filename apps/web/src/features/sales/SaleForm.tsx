import { useState } from 'react';
import { fetchPartners, mapError, type SaleInput } from './api';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { formatMoney } from '@patabin/shared';

type Props = {
  title: string;
  submitLabel: string;
  initial: Partial<SaleInput> & { kind: 'external' | 'internal' };
  defaultPrice?: number;
  onSubmit: (payload: SaleInput) => Promise<void>;
};

const payMethods = [
  { id: 'cash', label: 'নগদ' },
  { id: 'bkash', label: 'বিকাশ' },
  { id: 'nagad', label: 'নগদ (এপ)' },
  { id: 'rocket', label: 'রকেট' },
  { id: 'bank', label: 'ব্যাংক' },
  { id: 'other', label: 'অন্যান্য' },
];

export default function SaleForm({ title, submitLabel, initial, defaultPrice = 300, onSubmit }: Props) {
  const [qty, setQty] = useState(initial.qty ? String(initial.qty) : '1');
  const [price, setPrice] = useState(String(initial.list_unit_price ?? defaultPrice));
  const [amount, setAmount] = useState('');
  const [customerName, setCustomerName] = useState(initial.customer_name ?? '');
  const [method, setMethod] = useState(initial.payment_method ?? 'cash');
  const [collector, setCollector] = useState<string | null>(initial.received_by_partner_id ?? null);
  const [consumer, setConsumer] = useState<string | null>(initial.partner_id ?? null);
  const [note, setNote] = useState(initial.note ?? '');
  const [soldAt, setSoldAt] = useState<string | undefined>(initial.sold_at ?? undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });

  const myPartner = useQuery({
    queryKey: ['my-partner'],
    queryFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('id').single();
      if (!profile) return null;
      const { data } = await supabase.from('partners').select('id').eq('user_id', profile.id).maybeSingle();
      return data?.id ?? null;
    },
  });

  const finalAmount = amount === '' ? String(Number(qty || '0') * Number(price || '0')) : amount;
  const listValue = Number(qty || '0') * Number(price || '0');
  const discount = Math.max(0, listValue - Number(finalAmount || '0'));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: SaleInput = {
      kind: initial.kind,
      qty: Number(qty) || 0,
      list_unit_price: Number(price) || 0,
      amount_received: Number(finalAmount) || 0,
      payment_method: method === '' ? null : method,
      note: note || null,
      customer_name: customerName || null,
      partner_id: initial.kind === 'internal' ? consumer ?? undefined : null,
      received_by_partner_id: initial.kind === 'external' ? collector ?? myPartner.data ?? undefined : null,
      sold_at: soldAt ?? null,
    };
    if (!payload.qty) {
      setError('পরিমাণ দিন।');
      return;
    }
    if (initial.kind === 'internal' && !payload.partner_id) {
      setError('পার্টনার নির্বাচন করুন।');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <Card className="flex flex-col gap-5 p-6">
      <PageTitle tag="PataBin" title={title} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label={'তালিকা মূল্য (৳)'}>
          <NumberInput value={price} onChange={setPrice} />
        </Field>
        <Field label={'পরিমাণ (পিস)'}>
          <div className="flex gap-2">
            <Btn className="w-12" onClick={() => setQty(String(Math.max(0, Number(qty) - 1)))}>
              -
            </Btn>
            <NumberInput className="grow" value={qty} onChange={setQty} />
            <Btn className="w-12" onClick={() => setQty(String(Number(qty) + 1))}>
              +
            </Btn>
          </div>
        </Field>
        <Field label={'টাকা (৳)'}>
          <NumberInput className="grow" value={finalAmount} onChange={setAmount} />
        </Field>
        <div className="p-caption rounded-xl bg-canvas px-4 py-3">
          তালিকা: {formatMoney(listValue)} · ছাড়: {formatMoney(discount)} ({qty && listValue ? Math.round((discount * 100) / listValue) : 0}%)
        </div>
        {initial.kind === 'external' && (
          <>
            <Field label={'ক্রেতার নাম (ঐচ্ছিক)'}>
              <input className="field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field label={'টাকা গ্রহণকারী'}>
              <select className="field" value={collector ?? myPartner.data ?? ''} onChange={(e) => setCollector(e.target.value)}>
                <option value="">-- নির্বাচন করুন --</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {initial.kind === 'internal' && (
          <Field label={'পার্টনার'}>
            <select className="field" value={consumer ?? ''} onChange={(e) => setConsumer(e.target.value)}>
              <option value="">-- নির্বাচন করুন --</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={'পেমেন্ট মাধ্যম (ঐচ্ছিক)'}>
          <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {payMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={'সময়'}>
          <TimeInput value={soldAt} onChange={setSoldAt} />
        </Field>
        <Field label={'নোট (ঐচ্ছিক)'}>
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Btn type="submit" busy={busy} disabled={!qty}>
          {submitLabel}
        </Btn>
      </form>
    </Card>
  );
}
