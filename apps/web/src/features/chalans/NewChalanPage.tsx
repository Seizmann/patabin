import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createChalan } from './api';
import { Btn, Card, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import TimeInput from 'components/forms/TimeInput';
import NumberInput from 'components/forms/NumberInput';
import { usePageTitle } from 'hooks/usePageTitle';
import { fetchSettings, fetchPartners } from 'lib/api';
import { mapError } from 'lib/errors';
import { formatMoney } from '@patabin/shared';

type Row = { id: string; name: string; qty: string; paid: string };

export default function NewChalanPage() {
  usePageTitle('নতুন চালান');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: partners = [], isPending } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const rate = String(settings?.default_buy_rate ?? 190);
  const size = String(settings?.default_packet_size ?? 20);

  const [rows, setRows] = useState<Row[]>([]);
  const [date, setDate] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(partners.map((p) => ({ id: p.id, name: p.name, qty: '', paid: '' })));
  }, [partners]);

  const setRow = (id: string, key: 'qty' | 'paid', value: string) =>
    setRows((rows) => rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const items = rows
      .filter((r) => Number(r.qty) > 0)
      .map((r) => ({ partner_id: r.id, qty: Number(r.qty), amount_paid: Number(r.paid) === 0 ? undefined : Number(r.paid) }));
    if (items.length === 0) {
      setError('অন্তত একজন পার্টনারের কেনা পিস দিন।');
      return;
    }
    setBusy(true);
    try {
      await createChalan({ purchase_date: date ?? null, buy_rate: Number(rate), pcs_per_packet: Number(size), note: note || null, items });
      await qc.invalidateQueries({ queryKey: ['chalans'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      nav('/packets');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle tag="PataBin" title="নতুন চালান" />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Card className="grid grid-cols-2 gap-4 p-6">
          <Field label="কেনার তারিখ ও সময়">
            <TimeInput value={date} onChange={setDate} />
          </Field>
          <Field label="কেনার দাম (প্রতি পিস)">
            <NumberInput value={rate} onChange={() => {}} />
          </Field>
          <Field label="প্যাকেটে পিস (default)">
            <NumberInput value={size} onChange={() => {}} />
          </Field>
        </Card>

        {isPending ? <Skeleton /> : null}
        <Card className="flex flex-col gap-4 p-6">
          {rows.map((r) => {
            const auto = Number(r.qty) * Number(rate);
            const shown = r.paid === '' ? (auto ? formatMoney(auto) : '') : formatMoney(Number(r.paid));
            return (
              <div key={r.id} className="grid grid-cols-3 items-end gap-3">
                <div>
                  <p className="p-caption mb-1 font-semibold">{r.name}</p>
                  <NumberInput value={r.qty} onChange={(v) => setRow(r.id, 'qty', v)} placeholder="পিস" />
                </div>
                <Field label={`টাকা (সাজেস্ট ${shown || '--'})`}>
                  <NumberInput value={r.paid} onChange={(v) => setRow(r.id, 'paid', v)} placeholder={auto ? String(auto) : 'টাকা'} />
                </Field>
              </div>
            );
          })}
        </Card>

        <Field label="নোট (ঐচ্ছিক)">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Btn type="submit" busy={busy}>
          চালান খোলুন
        </Btn>
      </form>
    </div>
  );
}
