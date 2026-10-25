import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { formatDhakaDate, formatMoney } from '@patabin/shared';
import emptySettlements from 'assets/images/empty/empty-settlements.png';

type BalanceRow = { partner_id: string; partner_name: string; entitlement: string | number; cash_held: string | number; balance: string | number };

export default function SettlementPage() {
  usePageTitle('হিসাব মেটানো');
  const qc = useQueryClient();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [takenOn, setTakenOn] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: balances = [] } = useQuery({ queryKey: ['balances'], queryFn: fetchBalances });
  const { data: transfers = [], isPending } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transfers').select('*').is('deleted_at', null).order('transferred_on', { ascending: false });
      if (error) throw error;
      return data as { id: string; transferred_on: string; from_partner_id: string; to_partner_id: string; amount: string | number; note: string | null }[];
    },
  });

  const nameOf = (id: string) => partners.find((p) => p.id === id)?.name ?? '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!fromId || !toId || fromId === toId || !Number(amount)) {
      setError('প্রেরক, প্রাপক আলাদা করে টাকার পরিমাণ দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: insErr } = await supabase.from('transfers').insert({
        from_partner_id: fromId,
        to_partner_id: toId,
        amount: Number(amount),
        transferred_on: takenOn ?? null,
        note: note || null,
      });
      if (insErr) throw insErr;
      await qc.invalidateQueries({ queryKey: ['transfers'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      setOk('হাতবদল সংরক্ষিত');
      setAmount('');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সমস্যা');
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="হিসাব মেটানো" />

      {balances?.length === 0 && <Empty img={emptySettlements} title="কেউ কাউকে দেবে না" caption="সব হিসাব মিলে আছে।" />}
      {balances && balances.length > 0 && (
        <div className="card p-5">
          <p className="p-label mb-3">কে কাকে কত দেবে</p>
          <div className="flex flex-col divide-y divide-hairline">
            {balances.map((b) => (
              <div key={b.partner_id} className="flex items-center justify-between py-2">
                <span className="p-caption font-medium">{b.partner_name}</span>
                <span className={`p-num font-semibold ${Number(b.balance) >= 0 ? 'text-good' : 'text-bad'}`}>
                  {Number(b.balance) === 0 ? 'শূন্য' : Number(b.balance) > 0 ? `পাবে ${formatMoney(b.balance)}` : `দেবে ${formatMoney(-Number(b.balance))}`}
                </span>
              </div>
            ))}
          </div>
          {balances.length === 2 && numberSentence(balances) && (
            <div className="p-caption mt-3 rounded-xl bg-canvas px-4 py-3">{numberSentence(balances)}</div>
          )}
        </div>
      )}

      <form onSubmit={submit} noValidate className="card grid grid-cols-2 gap-4 p-6">
        <Field label="যে দেবে">
          <select className="field" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="যে পাবে">
          <select className="field" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="টাকা (৳)">
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="সময়">
          <TimeInput value={takenOn} onChange={setTakenOn} />
        </Field>
        <Field label="নোট (ঐচ্ছিক)" className="col-span-2">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Btn type="submit" busy={busy}>
            হাতবদল লিখুন
          </Btn>
          {ok && <Notice tone="ok">{ok}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </form>

      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}
      {transfers && transfers.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">হস্তান্তর</th>
                <th className="p-3 font-semibold">টাকা</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDate(t.transferred_on)}</td>
                  <td className="p-3">
                    {nameOf(t.from_partner_id)} কে {nameOf(t.to_partner_id)} দিয়েছে
                  </td>
                  <td className="p-3">{formatMoney(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function numberSentence(balances: BalanceRow[]): string {
  const [a] = balances.filter((b) => Number(b.balance) !== 0);
  const b2 = balances.find((x) => x.balance !== a?.balance);
  if (!a || !b2 || Number(a.balance) * Number(b2.balance) >= 0) return '';
  const receiver = Number(a.balance) > 0 ? a : b2;
  const payer = Number(a.balance) > 0 ? b2 : a;
  return `${payer.partner_name} কে ${receiver.partner_name} ${formatMoney(Number(payer.balance) ? Number(payer.balance) : -Number(receiver.balance))} দেবে।`;
}

async function fetchPartners() {
  const { data, error } = await supabase.from('partners').select('id, name').order('name');
  if (error) throw error;
  return data ?? [];
}

async function fetchBalances() {
  const { data, error } = await supabase.from('v_partner_balance').select('*').order('partner_name');
  if (error) throw error;
  return (data ?? []) as BalanceRow[];
}
