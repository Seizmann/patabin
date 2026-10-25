import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import TimeInput from 'components/forms/TimeInput';
import NumberInput from 'components/forms/NumberInput';
import { formatDhakaDate, toBnDigits } from '@patabin/shared';
import offline from 'assets/images/empty/offline.png';

export default function AdjustmentsPage() {
  usePageTitle('নষ্ট/ক্ষতি');
  const qc = useQueryClient();
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('damage');
  const [note, setNote] = useState('');
  const [takenOn, setTakenOn] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: batches = [] } = useQuery({
    queryKey: ['batches-open-adj'],
    queryFn: async () => {
      const { data, error } = await supabase.from('batches').select('id, code, status').order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as { id: string; code: string; status: string }[];
    },
  });
  const { data: rows, isPending } = useQuery({
    queryKey: ['adjustments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_adjustments').select('*').is('deleted_at', null).order('adjusted_on', { ascending: false });
      if (error) throw error;
      return data as { id: string; batch_id: string; adjusted_on: string; qty: number; reason: string; note: string | null }[];
    },
  });

  const codeOf = (id: string) => batches.find((b) => b.id === id)?.code ?? '-';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!batchId || !Number(qty)) {
      setError('ব্যাচ ও পরিমাণ দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: insErr } = await supabase.from('stock_adjustments').insert({
        batch_id: batchId,
        adjusted_on: takenOn ?? null,
        qty: Number(qty),
        reason,
        note: note || null,
      });
      if (insErr) throw insErr;
      await qc.invalidateQueries({ queryKey: ['adjustments'] });
      await qc.invalidateQueries({ queryKey: ['batches'] });
      await qc.invalidateQueries({ queryKey: ['batch-stock'] });
      setOk('সংরক্ষিত');
      setQty('');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সমস্যা');
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="নষ্ট/ক্ষতি" />
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
          <TimeInput value={takenOn} onChange={setTakenOn} />
        </Field>
        <Field label="পরিমাণ (পিস)">
          <NumberInput value={qty} onChange={setQty} />
        </Field>
        <Field label="কারণ">
          <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="damage">নষ্ট</option>
            <option value="loss">হারানো</option>
            <option value="sample">নমুনা</option>
            <option value="other">অন্যান্য</option>
          </select>
        </Field>
        <Field label="নোট (ঐচ্ছিক)" className="col-span-2">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
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
      {rows?.length === 0 && <Empty img={offline} title="কিছু নষ্ট হয়নি" caption="স্টক বাদ দিতে হলে এখানে লিখুন।" />}
      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">ব্যাচ</th>
                <th className="p-3 font-semibold">পরিমাণ</th>
                <th className="p-3 font-semibold">কারণ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDate(x.adjusted_on)}</td>
                  <td className="p-3">{codeOf(x.batch_id)}</td>
                  <td className="p-3">{toBnDigits(x.qty)}</td>
                  <td className="p-3">{x.reason === 'damage' ? 'নষ্ট' : x.reason === 'loss' ? 'হারানো' : x.reason === 'sample' ? 'নমুনা' : 'অন্যান্য'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
