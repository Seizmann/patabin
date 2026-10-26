import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createCustomer, fetchCustomers } from 'features/customers/api';
import { fetchPacketsPreview, fetchWallets, type SaleInput } from './api';
import { fetchSettings } from 'lib/api';
import { walletDisplay } from 'lib/wallet';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { formatMoney } from '@patabin/shared';

const NEW = '__new__';

type Props = {
  title: string;
  submitLabel: string;
  initial?: Partial<SaleInput> & { customerId?: string };
  showCustomer?: boolean;
  onSubmit: (payload: SaleInput) => Promise<void>;
};

export default function SaleForm({ title, submitLabel, initial, onSubmit, showCustomer = true }: Props) {
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [price, setPrice] = useState(String(initial?.list_unit_price ?? ''));
  const [amount, setAmount] = useState(initial?.amount_received != null ? String(initial.amount_received) : '');
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [due, setDue] = useState(String(initial?.due_amount ?? ''));
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [freeName, setFreeName] = useState(initial?.customer_name ?? '');
  const [wallet, setWallet] = useState(initial?.wallet_account_id ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [soldAt, setSoldAt] = useState<string | undefined>(initial?.sold_at ?? undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });
  const { data: packets = [] } = useQuery({ queryKey: ['packets'], queryFn: fetchPacketsPreview });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: fetchCustomers });
  const list = customers ?? [];

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
    if (Number(due || 0) > 0 && customerId === '') {
      setError('বাকি রাখতে কাস্টমার বাছুন।');
      return;
    }
    if (Number(due || 0) + (amount === '' ? 0 : Number(amount)) > listValue) {
      setError('টাকা + বাকি তালিকা মূল্যের বেশি হয়নি তো?');
      return;
    }
    setBusy(true);
    try {
      let saleCustomer: string | null = customerId || null;
      let name: string | null = customerId === NEW ? null : freeName || null;
      let phone: string | null = null;
      if (customerId === NEW) {
        if (!newName.trim()) {
          setError('নতুন কাস্টমার-এর নাম দিন।');
          setBusy(false);
          return;
        }
        saleCustomer = await createCustomer(newName.trim(), newPhone.trim() || null);
        name = newName.trim();
        phone = newPhone.trim() || null;
      } else if (saleCustomer) {
        const hit = list.find((c) => c.id === saleCustomer);
        name = hit?.name ?? null;
        phone = hit?.phone ?? null;
      }
      await onSubmit({
        qty: Number(qty),
        list_unit_price: Number(price) || Number(settings?.default_sell_price ?? 300),
        amount_received: Number(amount === '' ? listValue : amount),
        due_amount: Number(due || 0),
        customer_id: saleCustomer,
        customer_name: name,
        customer_phone: phone,
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
          তালিকা: {formatMoney(listValue)} · ছাড়: {formatMoney(discount)} ({qty && listValue ? Math.round((discount * 100) / listValue) : 0}%) · বাকি: {formatMoney(Number(due || 0))}
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
                {walletDisplay(w)}
              </option>
            ))}
          </select>
        </Field>

        {showCustomer && (
          <>
            <Field label="কাস্টমার (ঐচ্ছিক)">
              <select className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">-- নির্বাচন করুন --</option>
                {list.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ''}
                  </option>
                ))}
                <option value={NEW}>নতুন কাস্টমার…</option>
              </select>
            </Field>
            {customerId === NEW && (
              <>
                <Field label="নতুন কাস্টমার-এর নাম">
                  <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </Field>
                <Field label="ফোন নাম্বার">
                  <input className="field" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </Field>
              </>
            )}
            {customerId === '' && (
              <Field label="নাম (কাস্টমার বিনা বিক্রি হলে)">
                <input className="field" value={freeName} onChange={(e) => setFreeName(e.target.value)} />
              </Field>
            )}
            <Field label="বাকি (ঐচ্ছিক — পরে নেওয়া টাকা)">
              <NumberInput value={due} onChange={setDue} placeholder="0" />
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
