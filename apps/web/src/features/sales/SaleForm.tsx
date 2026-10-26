import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCustomerHints, fetchPacketsPreview, fetchWallets, type SaleInput } from './api';
import { fetchSettings } from 'lib/api';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { formatMoney } from '@patabin/shared';

type Props = {
  title: string;
  submitLabel: string;
  initial?: Partial<SaleInput> & { id?: string };
  consumerDefault?: string;
  showCustomer?: boolean;
  onSubmit: (payload: SaleInput) => Promise<void>;
};

export default function SaleForm({ title, submitLabel, initial, onSubmit, showCustomer = true }: Props) {
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [price, setPrice] = useState(String(initial?.list_unit_price ?? ''));
  const [amount, setAmount] = useState(initial?.amount_received != null ? String(initial.amount_received) : '');
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? '');
  const [customerPhone, setCustomerPhone] = useState(initial?.customer_phone ?? '');
  const [wallet, setWallet] = useState(initial?.wallet_account_id ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [soldAt, setSoldAt] = useState<string | undefined>(initial?.sold_at ?? undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });
  const { data: packets = [] } = useQuery({ queryKey: ['packets'], queryFn: fetchPacketsPreview });
  const { data: hints = [] } = useQuery({ queryKey: ['customer-hints'], queryFn: fetchCustomerHints });

  const listValue = Number(qty || '0') * Number(price || '0');
  const discount = Math.max(0, listValue - Number(amount === '' ? listValue : amount || '0'));
  const packetPreview = (() => {
    let left = Number(qty || '0');
    const parts: string[] = [];
    for (const p of packets) {
      if (left <= 0) break;
      const take = Math.min(Number(p.remaining), left);
      left -= take;
      parts.push(`${p.packet_code} (${p.owner_name}) — ${take} পিস`);
    }
    return left > 0 ? [] : parts;
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!Number(qty)) {
      setError('পরিমাণ দিন।');
      return;
    }
    if (!wallet) {
      setError('কোথায় টাকা গেল বাছুন।');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        qty: Number(qty),
        list_unit_price: Number(price) || Number(settings?.default_sell_price ?? 300),
        amount_received: Number(amount === '' ? listValue : amount),
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        wallet_account_id: wallet,
        note: note || null,
        sold_at: soldAt ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সমস্যা');
    }
    setBusy(false);
  };

  return (
    <Card className="flex flex-col gap-5 p-6">
      <PageTitle tag="PataBin" title={title} />
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="তালিকা মূল্য (প্রতি পিস)">
          <NumberInput value={price} onChange={setPrice} placeholder={String(settings?.default_sell_price ?? 300)} />
        </Field>
        <Field label="পরিমাণ (পিস)">
          <div className="flex gap-2">
            <Btn className="w-12" onClick={() => setQty(String(Math.max(1, Number(qty) - 1)))}>
              −
            </Btn>
            <NumberInput className="grow" value={qty} onChange={setQty} />
            <Btn className="w-12" onClick={() => setQty(String(Number(qty) + 1))}>
              +
            </Btn>
          </div>
        </Field>
        <Field label="টাকা (৳)">
          <NumberInput className="grow" value={amount === '' ? String(listValue) : amount} onChange={setAmount} />
        </Field>
        <div className="p-caption rounded-xl bg-canvas px-4 py-3">
          তালিকা: {formatMoney(listValue)} · ছাড়: {formatMoney(discount)} ({qty && listValue ? Math.round((discount * 100) / listValue) : 0}%)
        </div>

        {packetPreview.length > 0 && (
          <div className="p-caption rounded-xl bg-canvas px-4 py-3">
            {packetPreview.map((line, i) => (
              <span key={i} className="mr-2">
                {line}
              </span>
            ))}
          </div>
        )}

        <Field label="কোথায় টাকা">
          <select className="field" value={wallet} onChange={(e) => setWallet(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>

        {showCustomer && (
          <>
            <Field label="ক্রেতার নাম (ঐচ্ছিক)">
              <input className="field" list="customer-names" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <datalist id="customer-names">
                {hints.map((h, i) => (
                  <option key={i} value={h.name} />
                ))}
              </datalist>
            </Field>
            <Field label="ফোন (ঐচ্ছিক)">
              <input className="field" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </Field>
          </>
        )}

        <Field label="সময়">
          <TimeInput value={soldAt} onChange={setSoldAt} />
        </Field>
        <Field label="নোট (ঐচ্ছিক)">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Btn type="submit" busy={busy} disabled={!Number(qty)}>
          {submitLabel}
        </Btn>
      </form>
    </Card>
  );
}
