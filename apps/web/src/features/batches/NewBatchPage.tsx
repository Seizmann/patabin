import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBatch, mapError, type BatchInput } from './api';
import { fetchPartners, fetchSettings } from 'features/sales/api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Field, Notice, PageTitle } from 'components/ui/base';
import TimeInput from 'components/forms/TimeInput';
import NumberInput from 'components/forms/NumberInput';

export default function NewBatchPage() {
  usePageTitle('নতুন ব্যাচ');
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });

  const [dateCustom, setDateCustom] = useState<string | undefined>(undefined);
  const [unitCost, setUnitCost] = useState<string | null>(null);
  const [packetSize, setPacketSize] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Record<string, { qty: string; amount: string }>>({});
  const [rowsInit, setRowsInit] = useState(false);
  const [expenses, setExpenses] = useState<{ paid: string; amount: string; category: string; costType: string; funding: string; note: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!rowsInit && partners.length && !rows[partners[0]!.id]) {
    setRows((r) => ({ ...r, [partners[0]!.id]: { qty: '', amount: '' } }));
    setRowsInit(true);
  }

  const getUnit = () => Number(unitCost ?? settings?.default_buy_rate ?? 190);

  const setRow = (pid: string, patch: Partial<{ qty: string; amount: string }>) =>
    setRows((r) => ({ ...r, [pid]: { qty: r[pid]?.qty ?? '', amount: r[pid]?.amount ?? '', ...patch } }));

  const submit = async () => {
    setError('');
    const contributions = partners
      .map((p) => ({ p, row: rows[p.id] }))
      .filter((x): x is { p: (typeof partners)[number]; row: { qty: string; amount: string } } => !!x.row?.qty && Number(x.row.qty) > 0)
      .map((x) => ({
        partner_id: x.p.id,
        qty: Number(x.row.qty),
        amount_paid: x.row.amount ? Number(x.row.amount) : Number(x.row.qty) * getUnit(),
      }));
    if (!contributions.length) {
      setError('অন্তত এক পার্টনারের পরিমাণ দিন।');
      return;
    }
    const payload: BatchInput = {
      purchase_date: dateCustom ?? null,
      unit_cost: getUnit(),
      pcs_per_packet: packetSize ? Number(packetSize) : null,
      note: note || null,
      contributions,
      expenses: expenses
        .filter((x) => x.paid && Number(x.amount) > 0)
        .map((x) => ({
          spent_on: dateCustom ?? null,
          paid_by_partner_id: x.paid,
          amount: Number(x.amount),
          category: x.category,
          cost_type: x.costType,
          funding: x.funding,
          note: x.note || null,
        })),
    };
    setBusy(true);
    try {
      const code = await createBatch(payload);
      await qc.invalidateQueries({ queryKey: ['batches'] });
      await qc.invalidateQueries({ queryKey: ['stock'] });
      nav(`/batches/${code}`);
    } catch (e) {
      setError(mapError(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle tag="PataBin" title="নতুন ব্যাচ" />
      <div className="card flex flex-col gap-5 p-6">
        <Field label="সময়">
          <TimeInput value={dateCustom} onChange={setDateCustom} />
        </Field>
        <Field label={`ইউনিট কস্ট (৳; ডিফল্ট ${settings?.default_buy_rate ?? 190})`}>
          <NumberInput value={unitCost ?? String(settings?.default_buy_rate ?? 190)} onChange={(v) => setUnitCost(v)} />
        </Field>
        <Field label="প্যাকেটে পিস (ঐচ্ছিক)">
          <NumberInput value={packetSize} onChange={setPacketSize} />
        </Field>

        <div>
          <p className="p-caption mb-2 font-semibold text-ink whitespace-nowrap">কে কত পিস কিনল, কত টাকা দিল</p>
          <div className="flex flex-col gap-3">
            {partners
              .filter((p) => rows[p.id])
              .map((p) => (
                <div key={p.id} className="flex items-end gap-2">
                  <div className="flex-1">
                    <span className="p-caption block font-semibold">{p.name}</span>
                  </div>
                  <Field label="পিস" className="w-24">
                    <NumberInput value={rows[p.id]?.qty ?? ''} onChange={(v) => setRow(p.id, { qty: v })} />
                  </Field>
                  <Field label="টাকা" className="w-28">
                    <NumberInput
                      value={rows[p.id]?.amount || String(Number(rows[p.id]?.qty || '0') * getUnit())}
                      onChange={(v) => setRow(p.id, { amount: v })}
                    />
                  </Field>
                  <Btn variant="ghost" onClick={() => setRows((r) => ({ ...r, [p.id]: { qty: '', amount: '' } }))}>
                    মুছুন
                  </Btn>
                </div>
              ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="p-caption font-semibold text-ink">খরচ (ঐচ্ছিক)</p>
            <Btn variant="ghost" onClick={() => setExpenses((x) => [...x, { paid: partners[0]?.id ?? '', amount: '', category: 'transport', costType: 'landed', funding: 'own_pocket', note: '' }])}>
              খরচ যোগ করুন
            </Btn>
          </div>
          <div className="flex flex-col gap-3">
            {expenses.map((x, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-3">
                <Field label="কে দিল">
                  <select className="field" value={x.paid} onChange={(e) => setExpenses((xs) => xs.map((y, j) => (i === j ? { ...y, paid: e.target.value } : y)))}>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="টাকা">
                  <NumberInput value={x.amount} onChange={(v) => setExpenses((xs) => xs.map((y, j) => (i === j ? { ...y, amount: v } : y)))} />
                </Field>
                <Field label="ক্যাটাগরি">
                  <select className="field" value={x.category} onChange={(e) => setExpenses((xs) => xs.map((y, j) => (i === j ? { ...y, category: e.target.value } : y)))}>
                    <option value="transport">পরিবহন</option>
                    <option value="packaging">প্যাকেজিং</option>
                    <option value="other">অন্যান্য</option>
                  </select>
                </Field>
                <Field label="ধরন">
                  <select className="field" value={x.costType} onChange={(e) => setExpenses((xs) => xs.map((y, j) => (i === j ? { ...y, costType: e.target.value } : y)))}>
                    <option value="landed">প্রতি-পিস কস্টে যুক্ত</option>
                    <option value="operating">সরাসরি খরচ</option>
                  </select>
                </Field>
                <Field label="টাকার উৎস">
                  <select className="field" value={x.funding} onChange={(e) => setExpenses((xs) => xs.map((y, j) => (i === j ? { ...y, funding: e.target.value } : y)))}>
                    <option value="own_pocket">নিজের পকেট</option>
                    <option value="sales_cash">ক্যাশ</option>
                  </select>
                </Field>
                <div className="flex items-end">
                  <Btn variant="ghost" onClick={() => setExpenses((xs) => xs.filter((_, j) => j !== i))}>
                    মুছুন
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Field label="নোট (ঐচ্ছিক)">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && <Notice tone="error">{error}</Notice>}
        <Btn disabled={!partners.length} onClick={() => void submit()} busy={busy}>
          ব্যাচ খুলুন
        </Btn>
      </div>
    </div>
  );
}
