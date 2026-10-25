import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchExpenses, fetchPartners } from './api';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import TimeInput from 'components/forms/TimeInput';
import NumberInput from 'components/forms/NumberInput';
import { formatDhakaDate, formatMoney } from '@patabin/shared';
import emptyExpenses from 'assets/images/empty/empty-expenses.png';

export default function ExpensesPage() {
  usePageTitle('খরচ');
  const qc = useQueryClient();
  const [batchId, setBatchId] = useState('');
  const [category, setCategory] = useState('transport');
  const [costType, setCostType] = useState('operating');
  const [funding, setFunding] = useState('own_pocket');
  const [paidBy, setPaidBy] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [spentOn, setSpentOn] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('batches').select('id, code, status').order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as { id: string; code: string; status: string }[];
    },
  });
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: rows, isPending } = useQuery({ queryKey: ['expenses'], queryFn: fetchExpenses });

  const nameOf = (id: string | null) => partners.find((x) => x.id === id)?.name ?? '';
  const codeOf = (id: string) => batches.find((b) => b.id === id)?.code ?? '-';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!batchId || !paidBy || !Number(amount)) {
      setError('ব্যাচ, প্রদানকারী ও টাকার পরিমাণ দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: insErr } = await supabase.from('expenses').insert({
        batch_id: batchId,
        spent_on: spentOn ?? null,
        category,
        cost_type: costType,
        amount: Number(amount),
        paid_by_partner_id: paidBy,
        funding,
        note: note || null,
      });
      if (insErr) throw insErr;
      await qc.invalidateQueries({ queryKey: ['expenses'] });
      await qc.invalidateQueries({ queryKey: ['batches'] });
      setOk('খরচ সংরক্ষিত');
      setAmount('');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সমস্যা');
    }
    setBusy(false);
  };

  const del = async (id: string) => {
    setError('');
    if (!window.confirm('খরচটি মুছে ফেলা হবে; নিশ্চিত?')) return;
    try {
      const { error: delErr } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (delErr) throw delErr;
      await qc.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সমস্যা');
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="খরচ" />
      <form onSubmit={submit} noValidate className="card grid grid-cols-2 gap-4 p-6">
        <Field label="ব্যাচ" className="col-span-2 sm:col-span-1">
          <select className="field" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}{b.status === 'closed' ? ' (বন্ধ)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="সময়" className="col-span-2 sm:col-span-1">
          <TimeInput value={spentOn} onChange={setSpentOn} />
        </Field>
        <Field label="ক্যাটাগরি">
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="transport">পরিবহন</option>
            <option value="packaging">প্যাকেজিং</option>
            <option value="other">অন্যান্য</option>
          </select>
        </Field>
        <Field label="ধরন">
          <select className="field" value={costType} onChange={(e) => setCostType(e.target.value)}>
            <option value="landed">প্রতি-পিস কস্টে যুক্ত</option>
            <option value="operating">সরাসরি খরচ</option>
          </select>
        </Field>
        <Field label="টাকার উৎস">
          <select className="field" value={funding} onChange={(e) => setFunding(e.target.value)}>
            <option value="own_pocket">নিজের পকেট</option>
            <option value="sales_cash">ক্যাশ</option>
          </select>
        </Field>
        <Field label="টাকা (৳)">
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="কে দিল">
          <select className="field" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="নোট (ঐচ্ছিক)">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Btn type="submit" busy={busy}>
            খরচ যোগ করুন
          </Btn>
          {ok && <Notice tone="ok">{ok}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </form>

      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}
      {rows?.length === 0 && <Empty img={emptyExpenses} title="কোনো খরচ নেই" caption="ব্যাচ বেছে খরচ যোগ করুন।" />}
      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">ব্যাচ</th>
                <th className="p-3 font-semibold">বিবরণ</th>
                <th className="p-3 font-semibold">টাকা</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDate(x.spent_on)}</td>
                  <td className="p-3">{codeOf(x.batch_id)}</td>
                  <td className="p-3">
                    {bnCat(x.category)} · {x.cost_type === 'landed' ? 'কস্টে যুক্ত' : 'অপারেটিং'} · {x.funding === 'own_pocket' ? 'নিজের পকেট' : 'ক্যাশ'} · {nameOf(x.paid_by_partner_id)}
                  </td>
                  <td className="p-3">{formatMoney(x.amount)}</td>
                  <td className="p-3 text-right">
                    <Btn variant="ghost" onClick={() => void del(x.id)}>
                      মুছুন
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function bnCat(c: string): string {
  return c === 'transport' ? 'পরিবহন' : c === 'packaging' ? 'প্যাকেজিং' : 'অন্যান্য';
}
