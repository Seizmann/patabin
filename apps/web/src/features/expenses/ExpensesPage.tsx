import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createExpense, fetchExpenses, fetchPartners, fetchWallets, type ExpenseRow } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { supabase } from 'lib/supabase';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import TimeInput from 'components/forms/TimeInput';
import NumberInput from 'components/forms/NumberInput';
import { mapError } from 'lib/errors';
import { formatDhakaDate, formatMoney } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import emptyExpenses from 'assets/images/empty/empty-expenses.png';

export default function ExpensesPage() {
  usePageTitle('খরচ');
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [attributedTo, setAttributedTo] = useState('');
  const [wallet, setWallet] = useState('');
  const [note, setNote] = useState('');
  const [spentAt, setSpentAt] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: wallets } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });
  const { data: rows, isPending } = useQuery({ queryKey: ['expenses'], queryFn: fetchExpenses });
  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const nameOf = (id: string | null) => partners.find((x) => x.id === id)?.name ?? '';
  const catOf = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!category || !Number(amount) || !paidBy || !attributedTo) {
      setError('ক্যাটাগরি, টাকা এবং কে দিল আর কার খরচ বাছুন।');
      return;
    }
    setBusy(true);
    try {
      await createExpense({
        category_id: category,
        amount: Number(amount),
        paid_by_partner_id: paidBy,
        attributed_to_partner_id: attributedTo,
        wallet_account_id: wallet || null,
        note: note || null,
        spent_at: spentAt ?? null,
      });
      await qc.invalidateQueries({ queryKey: ['expenses'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      await qc.invalidateQueries({ queryKey: ['wallets'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOk('খরচ সংরক্ষিত');
      setAmount('');
      setNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const del = async (id: string) => {
    setError('');
    if (!window.confirm('খরচটি মুছে ফেলা হবে; নিশ্চিত?')) return;
    try {
      await supabase.rpc('delete_expense', { p_id: id });
      await qc.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err) {
      setError(mapError(err));
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="খরচ" />
      <form onSubmit={submit} noValidate className="card grid grid-cols-2 gap-4 p-6">
        <Field label="ক্যাটাগরি">
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
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
        <Field label="কার খরচ (ম্যানুয়াল বাছুন)">
          <select className="field" value={attributedTo} onChange={(e) => setAttributedTo(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="কোথা থেকে দেওয়া হলো" className="col-span-2 sm:col-span-1">
          <select className="field" value={wallet} onChange={(e) => setWallet(e.target.value)}>
            <option value="">নিজের পকেট</option>
            {(wallets ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="সময়" className="col-span-2 sm:col-span-1">
          <TimeInput value={spentAt} onChange={setSpentAt} />
        </Field>
        <Field label="নোট (ঐচ্ছিক)" className="col-span-2">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {paidBy && attributedTo && (
          <div className="p-caption col-span-2 rounded-xl bg-canvas px-4 py-3">
            {nameOf(paidBy)} দিল, কিন্তু খরচে ধরা হবে <b>{nameOf(attributedTo)}</b> এর হিসাবে। {wallet === '' && 'ওয়ালেট থেকে না, নিজের পকেট থেকে — {nameOf(paidBy)} কে ফেরত ধরা হবে।'.replace('{nameOf(paidBy)}', nameOf(paidBy))}
          </div>
        )}
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
      {rows?.length === 0 && <Empty img={emptyExpenses} title="কোনো খরচ নেই" caption="ট্রান্সপোর্ট, রিচার্জ ইত্যাদি এখানে যোগ হবে।" />}
      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">ক্যাটাগরি</th>
                <th className="p-3 font-semibold">বিবরণ</th>
                <th className="p-3 font-semibold">টাকা</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((x: ExpenseRow) => (
                <tr key={x.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDate(x.spent_at)}</td>
                  <td className="p-3">{catOf(x.category_id)}</td>
                  <td className="p-3 text-xs">
                    {nameOf(x.paid_by_partner_id)} → {nameOf(x.attributed_to_partner_id)} এর · {x.wallet_account_id ? walletDisplay((wallets ?? []).find((w) => w.id === x.wallet_account_id) ?? { name: '', label: '', type: '' }) : 'নিজের পকেট'}
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
