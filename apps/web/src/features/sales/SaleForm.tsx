import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createCustomer, fetchCustomers } from 'features/customers/api';
import { fetchPacketsPreview, fetchWallets, type AllocationInput, type ReceiveInput, type SaleInput } from './api';
import { fetchSettings } from 'lib/api';
import { walletDisplay } from 'lib/wallet';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { Plus } from '@phosphor-icons/react';
import { formatMoney, toBnDigits } from '@patabin/shared';

const NEW = '__new__';

type WalletOption = { id: string; type: string; name: string; label: string };
type Line = { wallet: string; amount: string };

type Props = {
  title: string;
  submitLabel: string;
  initial?: Partial<SaleInput> & { customerId?: string };
  showCustomer?: boolean;
  onSubmit: (payload: SaleInput) => Promise<void>;
};

export default function SaleForm({ title, submitLabel, initial, onSubmit, showCustomer = true }: Props) {
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [price, setPrice] = useState(initial?.list_unit_price != null ? String(initial.list_unit_price) : '');
  const [amount, setAmount] = useState(initial?.amount_received != null ? String(initial.amount_received) : '');
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [due, setDue] = useState(String(initial?.due_amount ?? ''));
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [freeName, setFreeName] = useState(initial?.customer_name ?? '');
  const [wallet, setWallet] = useState(initial?.wallet_account_id ?? '');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState(initial?.note ?? '');
  const [soldAt, setSoldAt] = useState<string | undefined>(initial?.sold_at ?? undefined);
  const [manualAlloc, setManualAlloc] = useState((initial?.allocations?.length ?? 0) > 0);
  const [allocs, setAllocs] = useState<Record<string, string>>(() => Object.fromEntries((initial?.allocations ?? []).map((a) => [a.packet_id, String(a.qty)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });
  const { data: packets = [] } = useQuery({ queryKey: ['packets-preview'], queryFn: fetchPacketsPreview });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: fetchCustomers });
  const list = customers ?? [];

  useEffect(() => {
    if (initial?.list_unit_price == null && price === '' && settings?.default_sell_price != null) {
      setPrice(String(settings.default_sell_price));
    }
  }, [price, settings?.default_sell_price, initial?.list_unit_price]);

  const listValue = Number(qty || '0') * Number(price || '0');
  const dueNum = Number(due || '0');
  const received = amount === '' ? Math.max(0, listValue - dueNum) : Number(amount || '0');
  const discount = Math.max(0, listValue - received - dueNum);
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
    if (manualAlloc) {
      const picked = Object.entries(allocs).filter(([, v]) => Number(v) > 0);
      if (picked.reduce((s, [, v]) => s + Number(v), 0) !== Number(qty)) {
        setError('বাছাই করা প্যাকেটের যোগ পরিমাণের সমান হবে।');
        return;
      }
    }
    if (!wallet) {
      setError('কোথায় টাকা গেল বাছুন।');
      return;
    }
    if (Number(due || 0) > 0 && customerId === '') {
      setError('বাকি রাখতে কাস্টমার বাছুন।');
      return;
    }
    if (dueNum + received > listValue) {
      setError('টাকা + বাকি তালিকা মূল্যের বেশি হয়নি তো?');
      return;
    }
    if (lines.length > 0) {
      const sum = lines.reduce((acc, l) => acc + Number(l.amount || 0), 0);
      if (sum !== received) {
        setError(`ভাগ করা টাকা ${formatMoney(sum)} — মোট ${formatMoney(received)} হবে তো?`);
        return;
      }
      if (lines.some((l) => !l.wallet || !Number(l.amount))) {
        setError('প্রতিটি ভাগে ওয়ালেট ও টাকা দিন।');
        return;
      }
    }
    const receiveList: ReceiveInput[] | undefined = lines.length > 0
      ? lines.map((l) => ({ wallet_account_id: l.wallet, amount: Number(l.amount) }))
      : undefined;
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
        amount_received: received,
        due_amount: Number(due || 0),
        customer_id: saleCustomer,
        customer_name: name,
        customer_phone: phone,
        wallet_account_id: receiveList?.[0]?.wallet_account_id ?? wallet,
        receives: receiveList,
        allocations: manualAlloc
          ? Object.entries(allocs)
              .filter(([, v]) => Number(v) > 0)
              .map(([packet_id, v]) => ({ packet_id, qty: Number(v) }) as AllocationInput)
          : undefined,
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
          <NumberInput className="grow" value={amount === '' ? String(received) : amount} onChange={setAmount} />
        </Field>
        <div className="p-caption rounded-xl bg-canvas px-4 py-3">
          তালিকা: {formatMoney(listValue)} · ছাড়: {formatMoney(discount)} ({qty && listValue ? Math.round((discount * 100) / listValue) : 0}%) · বাকি: {formatMoney(Number(due || 0))}
        </div>

        <Field label="পরিমাণ কাটা">
          <select className="field" value={manualAlloc ? 'custom' : 'auto'} onChange={(e) => setManualAlloc(e.target.value === 'custom')}>
            <option value="auto">অটো (বিক্রির ক্রম অনুযায়ী)</option>
            <option value="custom">নিজে বাছাই (কাস্টম)</option>
          </select>
        </Field>

        {manualAlloc ? (
          <div className="flex flex-col gap-2">
            {packets.length === 0 && <p className="p-caption text-ink-mute">বাছাই করার মতো প্যাকেট নেই।</p>}
            {packets.map((p) => (
              <div key={p.packet_id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {p.packet_code} · {p.owner_name}
                  </p>
                  <p className="p-caption text-ink-mute">{toBnDigits(p.remaining)} বাকি</p>
                </div>
                <NumberInput
                  className="w-24"
                  value={allocs[p.packet_id] ?? ''}
                  onChange={(v) => setAllocs((cur) => ({ ...cur, [p.packet_id]: v }))}
                  placeholder="0"
                />
              </div>
            ))}
            <p className={`p-caption ${Object.values(allocs).reduce((s, v) => s + Number(v || 0), 0) === Number(qty || '0') ? 'text-good' : 'text-bad'}`}>
              বাছাই করা: {toBnDigits(Object.values(allocs).reduce((s, v) => s + Number(v || 0), 0))} / {toBnDigits(Number(qty || '0'))}
            </p>
          </div>
        ) : (
          packetPreview.length > 0 && (
            <div className="p-caption rounded-xl bg-canvas px-4 py-3">
              {packetPreview.map((line, i) => (
                <span key={i} className="mr-2">
                  {line}
                </span>
              ))}
            </div>
          )
        )}

        {lines.length === 0 && (
          <Field label="কোথায় টাকা">
            <div className="flex items-center gap-2">
              <select className="field min-h-[44px] grow" value={wallet} onChange={(e) => setWallet(e.target.value)}>
                <option value="">-- নির্বাচন করুন --</option>
                {(wallets as WalletOption[]).map((w) => (
                  <option key={w.id} value={w.id}>
                    {walletDisplay(w)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="ভাগ করুন (একাধিক ওয়ালেট)"
                className="btn grid h-11 w-11 shrink-0 place-items-center p-0"
                onClick={() => setLines([{ wallet: wallet, amount: String(received) }, { wallet: wallets[1]?.id ?? '', amount: '0' }])}
                disabled={wallets.length < 2 && (wallets as WalletOption[]).length < 2}
              >
                <Plus weight="bold" size={18} />
              </button>
            </div>
          </Field>
        )}
        {lines.length > 0 && (
          <div className="flex flex-col gap-3">
            {(lines as Line[]).map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr] gap-2">
                <select
                  className="field min-h-[44px]"
                  value={l.wallet}
                  aria-label={`ভাগ ${i + 1} ওয়ালেট`}
                  onChange={(e) => setLines((ls) => ls.map((x, xi) => (xi === i ? { ...x, wallet: e.target.value } : x)))}
                >
                  <option value="">-- ওয়ালেট --</option>
                  {(wallets as WalletOption[]).map((w) => (
                    <option key={w.id} value={w.id}>
                      {walletDisplay(w)}
                    </option>
                  ))}
                </select>
                <NumberInput value={l.amount} aria-label={`ভাগ ${i + 1} টাকা`} onChange={(v) => setLines((ls) => ls.map((x, xi) => (xi === i ? { ...x, amount: v } : x)))} placeholder="৳" />
                <Btn variant="ghost" className="col-span-2 text-left text-bad" onClick={() => setLines((ls) => (ls.length <= 1 ? [] : ls.filter((_, xi) => xi !== i)))}>
                  ভাগ মুছুন
                </Btn>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <div className="p-caption rounded-xl bg-canvas px-3 py-2 grow">
                বাকি থাকবে: {formatMoney(Math.max(0, received - lines.reduce((acc, l) => acc + Number(l.amount || 0), 0)))}
              </div>
              <button type="button" aria-label="আরেকটি ভাগ" className="btn grid h-11 w-11 shrink-0 place-items-center p-0" onClick={() => setLines((ls) => [...ls, { wallet: "", amount: "0" }])}>
                <Plus weight="bold" size={18} />
              </button>
            </div>
          </div>
        )}

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
