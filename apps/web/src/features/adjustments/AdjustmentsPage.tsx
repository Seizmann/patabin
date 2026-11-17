import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import TimeInput from 'components/forms/TimeInput';
import NumberInput from 'components/forms/NumberInput';
import { mapError } from 'lib/errors';
import { useWriteGuard } from 'hooks/useWriteGuard';
import { useViewMode } from 'lib/viewMode';
import { formatDhakaDateTime, formatMoney, toBnDigits } from '@patabin/shared';
import offline from 'assets/images/empty/offline.png';

type PacketRow = { packet_id: string; packet_code: string; owner_partner_id: string; owner_name: string; remaining: number };

type AdjustmentRow = {
  id: string;
  packet_id: string;
  at: string;
  qty: number;
  reason: string;
  person: string | null;
  note: string | null;
  packets: { code: string; partners: { name: string } | null; chalans: { code: string; buy_rate: number } | null } | null;
};

export default function AdjustmentsPage() {
  usePageTitle('নষ্ট/ফ্রি');
  const qc = useQueryClient();
  const { guard, denied } = useWriteGuard('adjustments');
  const [packetId, setPacketId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('gift');
  const [person, setPerson] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');
  const { myPartnerId: mine, isSelf } = useViewMode();

  const { data: packets = [] } = useQuery({
    queryKey: ['packets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_packet_stock').select('packet_id, packet_code, owner_partner_id, owner_name, remaining').eq('chalan_status', 'open').gt('remaining', 0);
      if (error) throw error;
      return (data ?? []) as PacketRow[];
    },
  });
  const { data: rows, isPending } = useQuery({
    queryKey: ['adjustments', start, end, isSelf ? mine : ''],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select('id, packet_id, at, qty, reason, person, note, packets(code, partners(name), chalans(code, buy_rate))')
        .is('deleted_at', null).gte('at', start).lt('at', end).order('at', { ascending: false });
      if (error) throw error;
      let result = (data ?? []) as unknown as (AdjustmentRow & { packet_id: string })[];
      if (isSelf && mine) {
        const myIds = new Set(packets.filter((p) => p.owner_partner_id === mine).map((p) => p.packet_id));
        result = result.filter((r) => myIds.has(r.packet_id));
      }
      return result as unknown as AdjustmentRow[];
    },
  });

  const summaries = (() => {
    const groups = new Map<string, { code: string; rows: { owner: string; pcs: number; cost: number; reasons: Map<string, number> }[] }>();
    for (const x of rows ?? []) {
      const code = x.packets?.chalans?.code ?? 'অজানা';
      let g = groups.get(code);
      if (!g) {
        g = { code, rows: [] };
        groups.set(code, g);
      }
      const owner = x.packets?.partners?.name ?? 'অজানা';
      let row = g.rows.find((r) => r.owner === owner);
      if (!row) {
        row = { owner, pcs: 0, cost: 0, reasons: new Map() };
        g.rows.push(row);
      }
      row.pcs += Number(x.qty);
      row.cost += Number(x.qty) * Number(x.packets?.chalans?.buy_rate ?? 0);
      row.reasons.set(x.reason, (row.reasons.get(x.reason) ?? 0) + Number(x.qty));
    }
    return [...groups.values()];
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!packetId || !Number(qty)) {
      setError('প্যাকেট ও পরিমাণ দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_adjustment', {
        p_adj: { packet_id: packetId, qty: Number(qty), reason, person: person || null, note: note || null, at: at ?? null },
      });
      if (rpcErr) throw rpcErr;
      await qc.invalidateQueries({ queryKey: ['adjustments'] });
      await qc.invalidateQueries({ queryKey: ['packets'] });
      await qc.invalidateQueries({ queryKey: ['packet'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOk('সংরক্ষিত');
      setQty('');
      setPerson('');
      setNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const bnReason = (r: string) => (r === 'gift' ? 'ফ্রি দেওয়া' : r === 'damage' ? 'নষ্ট' : r === 'loss' ? 'হারানো' : r === 'sample' ? 'নমুনা' : 'অন্যান্য');

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="নষ্ট/ফ্রি"
        right={<PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />}
      />
      <form onSubmit={guard(submit)} noValidate className="card grid grid-cols-2 gap-4 p-6">
        <Field label="প্যাকেট, যারটা থেকে" className="col-span-2">
          <select className="field" value={packetId} onChange={(e) => setPacketId(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {packets.map((p) => (
              <option key={p.packet_id} value={p.packet_id}>
                {p.packet_code} · {p.owner_name} · {toBnDigits(p.remaining)} বাকি
              </option>
            ))}
          </select>
        </Field>
        <Field label="পরিমাণ (পিস)">
          <NumberInput value={qty} onChange={setQty} />
        </Field>
        <Field label="কারণ">
          <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="gift">ফ্রি দেওয়া</option>
            <option value="damage">নষ্ট</option>
            <option value="loss">হারানো</option>
            <option value="sample">নমুনা</option>
            <option value="other">অন্যান্য</option>
          </select>
        </Field>
        <Field label="কাকে ফ্রি দেওয়া হলো (ঐচ্ছিক)">
          <input className="field" value={person} onChange={(e) => setPerson(e.target.value)} />
        </Field>
        <Field label="সময়">
          <TimeInput value={at} onChange={setAt} />
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
      {denied}

      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}
      {rows?.length === 0 && <Empty img={offline} title="কিছু নষ্ট বা ফ্রি হয়নি" caption="স্টক বাদ দিতে হলে এখানে লিখুন।" />}
      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="p-label">চালান অনুযায়ী হিসাব</p>
          {summaries.map((g) => (
            <div key={g.code} className="card p-5">
              <p className="p-title mb-3">চালান {g.code}</p>
              <div className="flex flex-col divide-y divide-hairline">
                {g.rows.map((r) => (
                  <div key={r.owner} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.owner}</p>
                      <p className="p-caption text-ink-mute">
                        {[...r.reasons.entries()].map(([reason, qty]) => `${bnReason(reason)} ${toBnDigits(qty)}`).join(' · ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="p-num text-sm font-bold">{toBnDigits(r.pcs)} পিস</p>
                      <p className="p-caption p-num text-ink-mute">কেনার দামে {formatMoney(r.cost)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="p-caption mt-3 rounded-xl bg-canvas px-4 py-3">
                এই পিসগুলোর ক্ষতি প্যাকেটের মালিক বহন করবে — হিসাবে তার অংশ থেকে বাদ পড়বে।
              </p>
            </div>
          ))}
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">প্যাকেট</th>
                <th className="p-3 font-semibold">পরিমাণ</th>
                <th className="p-3 font-semibold">কারণ</th>
                <th className="p-3 font-semibold">কাকে</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDateTime(x.at)}</td>
                  <td className="p-3 text-xs">{
                    x.packets
                      ? `${x.packets.code} · ${x.packets.partners?.name ?? '-'}`
                      : '-'
                  }</td>
                  <td className="p-3">{toBnDigits(x.qty)}</td>
                  <td className="p-3">{bnReason(x.reason)}</td>
                  <td className="p-3">{x.person ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
