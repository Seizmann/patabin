import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createCustomer, createPayment, deleteCustomer, fetchCustomerBalances, fetchCustomers, fetchPayments, fetchWallets, updateCustomer, type CustomerRow, type WalletRow } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { mapError } from 'lib/errors';
import { walletDisplay } from 'lib/wallet';
import NumberInput from 'components/forms/NumberInput';
import { formatDhakaDate, formatMoney } from '@patabin/shared';
import emptySearch from 'assets/images/empty/empty-search.png';

export default function CustomersPage() {
  usePageTitle('কাস্টমার');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: rows, isPending } = useQuery({ queryKey: ['customers'], queryFn: fetchCustomers });
  const { data: balances = [] } = useQuery({ queryKey: ['customer-balances'], queryFn: fetchCustomerBalances });
  const { data: payments = [] } = useQuery({ queryKey: ['customer-payments'], queryFn: fetchPayments });
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });

  const [payOpen, setPayOpen] = useState<CustomerRow | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payWallet, setPayWallet] = useState('');
  const [payNote, setPayNote] = useState('');

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!name.trim()) {
      setError('নাম দিন।');
      return;
    }
    setBusy(true);
    try {
      await createCustomer(name.trim(), phone.trim() || null);
      await qc.invalidateQueries({ queryKey: ['customers'] });
      setOk('কাস্টমার যোগ হয়েছে');
      setName('');
      setPhone('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    setError('');
    setBusy(true);
    try {
      await updateCustomer(editing.id, editing.name.trim(), editing.phone?.trim() || null);
      await qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(null);
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOpen || !Number(payAmount) || !payWallet) {
      setError('টাকা ও ওয়ালেট দিন।');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createPayment({ customer_id: payOpen.id, amount: Number(payAmount), wallet_account_id: payWallet, note: payNote || null });
      await qc.invalidateQueries({ queryKey: ['customer-balances'] });
      await qc.invalidateQueries({ queryKey: ['customer-payments'] });
      await qc.invalidateQueries({ queryKey: ['wallets-all'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      setPayOpen(null);
      setPayAmount('');
      setPayNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const del = async (id: string) => {
    setError('');
    if (!window.confirm('কাস্টমার মুছে ফেলা হবে; নিশ্চিত?')) return;
    try {
      await deleteCustomer(id);
      await qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (err) {
      setError(mapError(err));
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageTitle tag="PataBin" title="কাস্টমার" />
      <Notice tone="info">বাকি টাকা (due): পাবে বোঝায় কাস্টমার দিবে; অতিরিক্ত দিলে উগরানো হবে।</Notice>
      <form onSubmit={add} noValidate className="card grid grid-cols-2 gap-4 p-6">
        <Field label="নাম">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="ফোন নাম্বার">
          <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Btn type="submit" busy={busy}>
            যোগ করুন
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
      {rows?.length === 0 && <Empty img={emptySearch} title="কোনো কাস্টমার নেই" caption="বিক্রির সময় কাস্টমার বেছে নিতে আগে যোগ করুন।" />}
      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">নাম</th>
                <th className="p-3 font-semibold">ফোন</th>
                <th className="p-3 font-semibold">বাকি</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-hairline last:border-0">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">{c.phone ?? '-'}</td>
                  <td className={`p-3 font-semibold ${Number(balances.find((b) => b.customer_id === c.id)?.balance ?? 0) > 0 ? 'text-bad' : 'text-ink'}`}>
                    {formatMoney(Number(balances.find((b) => b.customer_id === c.id)?.balance ?? 0))}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Btn variant="ghost" onClick={() => setPayOpen(c)}>
                        শোধ নিন
                      </Btn>
                      <Btn variant="ghost" onClick={() => setEditing(c)}>
                        সম্পাদনা
                      </Btn>
                      <Btn variant="ghost" onClick={() => void del(c.id)}>
                        মুছুন
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payOpen && (
        <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/40 sm:items-center sm:p-6">
          <div role="dialog" aria-modal="true" className="card w-full max-h-[92vh] overflow-y-auto rounded-b-3xl p-5 sm:mx-auto sm:max-w-lg sm:rounded-3xl">
            <p className="p-title mb-4">{payOpen.name} — শোধ নিন</p>
            <form onSubmit={submitPayment} noValidate className="flex flex-col gap-4">
              <Field label="টাকা (৳)">
                <NumberInput value={payAmount} onChange={setPayAmount} />
              </Field>
              <Field label="কোথায় জমা হলো">
                <select className="field" value={payWallet} onChange={(e) => setPayWallet(e.target.value)}>
                  <option value="">-- নির্বাচন করুন --</option>
                  {wallets.map((w: WalletRow) => (
                    <option key={w.id} value={w.id}>
                      {walletDisplay(w)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="নোট (ঐচ্ছিক)">
                <input className="field" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => setPayOpen(null)}>
                  বাতিল
                </Btn>
                <Btn type="submit" busy={busy}>
                  শোধ সংরক্ষণ
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="card overflow-x-auto">
          <p className="p-label p-4 pb-0">শোধের ইতিহাস</p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">কাস্টমার</th>
                <th className="p-3 font-semibold">টাকা</th>
                <th className="p-3 font-semibold">কোথায়</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDate(p.at)}</td>
                  <td className="p-3">{(rows ?? []).find((c) => c.id === p.customer_id)?.name ?? '-'}</td>
                  <td className="p-3">{formatMoney(p.amount)}</td>
                  <td className="p-3 text-xs">{walletDisplay(wallets.find((w) => w.id === p.wallet_account_id) ?? { name: '', label: '', type: '' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/40 sm:items-center sm:p-6">
          <div role="dialog" aria-modal="true" className="card w-full max-h-[92vh] overflow-y-auto rounded-b-3xl p-5 sm:mx-auto sm:max-w-lg sm:rounded-3xl">
            <form onSubmit={saveEdit} noValidate className="flex flex-col gap-4">
              <Field label="নাম">
                <input className="field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="ফোন নাম্বার">
                <input className="field" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={() => setEditing(null)}>
                  বাতিল
                </Btn>
                <Btn type="submit" busy={busy}>
                  সংরক্ষণ করুন
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
