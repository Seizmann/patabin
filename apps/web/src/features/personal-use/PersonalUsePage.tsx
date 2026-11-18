import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash } from '@phosphor-icons/react';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { useDialog } from 'components/ui/Dialog';
import { useAuth } from 'lib/auth';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { fetchPartners, fetchSettings } from 'lib/api';
import { mapError } from 'lib/errors';
import { useWriteGuard } from 'hooks/useWriteGuard';
import { useViewMode } from 'lib/viewMode';
import { formatDhakaDateTime, formatMoney, toBnDigits } from '@patabin/shared';
import offline from 'assets/images/empty/offline.png';

type PacketRow = { packet_id: string; packet_code: string; owner_partner_id: string; owner_name: string; remaining: number };

type PersonalUseRow = {
  id: string;
  at: string;
  qty: number;
  unit_value: number;
  note: string | null;
  packet_id: string | null;
  chalan_id: string | null;
  eater_partner_id: string;
  partners: { name: string } | null;
  packets: { code: string; partners: { name: string } | null } | null;
  chalans: { code: string } | null;
};

async function fetchPersonalUses(start: string, end: string, partnerId = ''): Promise<PersonalUseRow[]> {
  let q = supabase
    .from('personal_uses')
    .select('id, at, qty, unit_value, note, packet_id, chalan_id, eater_partner_id, partners(name), packets(code, partners(name)), chalans(code)')
    .is('deleted_at', null)
    .gte('at', start)
    .lt('at', end)
    .order('at', { ascending: false });
  if (partnerId) {
    q = q.eq('eater_partner_id', partnerId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PersonalUseRow[];
}

export default function PersonalUsePage() {
  usePageTitle('ব্যক্তিগত ব্যবহার');
  const qc = useQueryClient();
  const dialog = useDialog();
  const { suAdmin, profile } = useAuth();
  const { guard, denied } = useWriteGuard('personal_use');
  const [ eater, setEater ] = useState('');
  const [packetId, setPacketId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { myPartnerId: myId, isSelf } = useViewMode();
  useEffect(() => {
    if (eater || partners.length === 0) return;
    const selfPartner = myId ?? partners.find((p) => p.name === profile?.display_name)?.id;
    if (selfPartner) setEater(selfPartner);
  }, [eater, partners, myId, profile?.display_name]);
  const { data: packets = [] } = useQuery({
    queryKey: ['packets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_packet_stock').select('packet_id, packet_code, owner_partner_id, owner_name, remaining').eq('chalan_status', 'open').gt('remaining', 0);
      if (error) throw error;
      return (data ?? []) as PacketRow[];
    },
  });
  const { data: uses = [], isPending: usesPending } = useQuery({ queryKey: ['personal-uses', start, end, isSelf ? myId : ''], queryFn: () => fetchPersonalUses(start, end, isSelf ? (myId ?? '') : '') });

  const chosen = packets.find((p) => p.packet_id === packetId) ?? null;
  const ownerIsOther = chosen && chosen.owner_partner_id !== (eater || myId);
  const value = Number(qty || '0') * Number(unit || settings?.default_sell_price || 300);

  const summaries = (() => {
    const groups = new Map<string, { code: string; rows: { eater: string; owner: string | null; pcs: number; amount: number }[]; owed: { from: string; to: string; amount: number }[] }>();
    for (const u of uses) {
      const code = u.chalans?.code ?? 'মজুদ';
      let g = groups.get(code);
      if (!g) {
        g = { code, rows: [], owed: [] };
        groups.set(code, g);
      }
      const eater = u.partners?.name ?? '-';
      const owner = u.packets?.partners?.name ?? null;
      let row = g.rows.find((r) => r.eater === eater && (r.owner ?? null) === owner);
      if (!row) {
        row = { eater, owner, pcs: 0, amount: 0 };
        g.rows.push(row);
      }
      row.pcs += Number(u.qty);
      row.amount += Number(u.qty) * Number(u.unit_value);
      if (owner && owner !== eater) {
        let o = g.owed.find((x) => x.from === eater && x.to === owner);
        if (!o) {
          o = { from: eater, to: owner, amount: 0 };
          g.owed.push(o);
        }
        o.amount += Number(u.qty) * Number(u.unit_value);
      }
    }
    return [...groups.values()];
  })();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    const eaterId = eater || myId;
    if (!eaterId || !Number(qty)) {
      setError('কে খাচ্ছে ও কত পিস দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_personal_use', {
        p_use: {
          eater_partner_id: eaterId,
          packet_id: packetId || null,
          qty: Number(qty),
          unit_value: Number(unit || settings?.default_sell_price || 300),
          note: note || null,
          at: at ?? null,
        },
      });
      if (rpcErr) throw rpcErr;
      await invalidateAll();
      setOk('সংরক্ষিত');
      setQty('');
      setNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ['packets'] });
    await qc.invalidateQueries({ queryKey: ['personal-uses'] });
    await qc.invalidateQueries({ queryKey: ['balances'] });
    await qc.invalidateQueries({ queryKey: ['dashboard'] });
    await qc.invalidateQueries({ queryKey: ['settlement'] });
    await qc.invalidateQueries({ queryKey: ['partner-balances'] });
  };

  const del = async (id: string) => {
    setError('');
    const okDel = await dialog.confirm({ title: 'ব্যবহার মুছে ফেলবেন?', message: 'এই ব্যক্তিগত ব্যবহারের এন্ট্রি মুছে ফেলা হবে; স্টক ফিরবে। নিশ্চিত?', destructive: true, confirmText: 'মুছুন' });
    if (!okDel) return;
    try {
      const { error: rpcErr } = await supabase.rpc('delete_personal_use', { p_id: id });
      if (rpcErr) throw rpcErr;
      await invalidateAll();
      setOk('মুছে ফেলা হয়েছে');
    } catch (err) {
      setError(mapError(err));
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Card className="flex flex-col gap-5 p-6">
        <PageTitle
          tag="PataBin"
          title="ব্যক্তিগত ব্যবহার"
          right={<PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />}
        />
        <form onSubmit={guard(submit)} className="flex flex-col gap-5" noValidate>
          <Field label="কে খাচ্ছে">
            <select className="field" value={eater} onChange={(e) => setEater(e.target.value)}>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="কোথা থেকে (প্যাকেট না বাছলে মজুদ ধরা হবে)">
            <select className="field" value={packetId} onChange={(e) => setPacketId(e.target.value)}>
              <option value="">প্যাকেট নেই (মজুদ)</option>
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
          <Field label="প্রতি পিস মূল্য">
            <NumberInput value={unit} onChange={setUnit} placeholder={String(settings?.default_sell_price ?? 300)} />
          </Field>
          {ownerIsOther && (
            <div className="p-caption rounded-xl bg-canvas px-4 py-3 text-good">
              {chosen?.owner_name} কে {formatMoney(value)} দিতে হবে — হিসাবে যোগ হয়ে গেছে।
            </div>
          )}
          <Field label="সময়">
            <TimeInput value={at} onChange={setAt} />
          </Field>
          <Field label="নোট (ঐচ্ছিক)">
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          {isSelf && <Notice tone="info">শুধু আপনার ব্যক্তিগত ব্যবহার দেখানো হচ্ছে (self mode)।</Notice>}
          {ok && <Notice tone="ok">{ok}</Notice>}
          <Btn type="submit" busy={busy} disabled={!Number(qty)}>
            সংরক্ষণ করুন
          </Btn>
        </form>
        {denied}
      </Card>

      {usesPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}
      {uses.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="p-label">চালান অনুযায়ী হিসাব</p>
          {summaries.map((g) => (
            <div key={g.code} className="card p-5">
              <p className="p-title mb-3">{g.code === 'মজুদ' ? 'মজুদ' : `চালান ${g.code}`}</p>
              <div className="flex flex-col divide-y divide-hairline">
                {g.rows.map((r) => (
                  <div key={`${r.eater}-${r.owner ?? 'মজুদ'}`} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.eater}</p>
                      <p className="p-caption text-ink-mute">{r.owner ? `${r.owner}-এর প্যাকেট থেকে` : 'মজুদ থেকে'}</p>
                    </div>
                    <div className="text-right">
                      <p className="p-num text-sm font-bold">{toBnDigits(r.pcs)} পিস</p>
                      <p className="p-caption p-num text-ink-mute">{formatMoney(r.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {g.owed.length > 0 && (
                <div className="mt-3 flex flex-col gap-1 rounded-xl bg-canvas px-4 py-3">
                  {g.owed.map((o) => (
                    <p key={`${o.from}-${o.to}`} className="p-caption">
                      <b>{o.from}</b> → <b>{o.to}</b> : {formatMoney(o.amount)} দিবে
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {uses.length === 0 && !usesPending && <Empty img={offline} title="কোনো ব্যক্তিগত ব্যবহার নেই" caption="খাওয়া/নিজের ব্যবহার যোগ করলে এখানে দেখা যাবে।" />}
      {uses.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">কে খাচ্ছে</th>
                <th className="p-3 font-semibold">উৎস</th>
                <th className="p-3 font-semibold">পরিমাণ</th>
                <th className="p-3 font-semibold">মূল্য</th>
                {suAdmin && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {uses.map((u) => (
                <tr key={u.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDateTime(u.at)}</td>
                  <td className="p-3">
                    {u.partners?.name ?? '-'}
                    {u.note ? <p className="p-caption text-ink-mute">{u.note}</p> : null}
                  </td>
                  <td className="p-3 text-xs">
                    {u.packets
                      ? `${u.packets.code}${u.packets.partners?.name ? ` (${u.packets.partners.name})` : ''}`
                      : u.chalans
                        ? `${u.chalans.code} · মজুদ`
                        : 'মজুদ'}
                  </td>
                  <td className="p-3">{toBnDigits(u.qty)}</td>
                  <td className="p-3">{formatMoney(Number(u.qty) * Number(u.unit_value))}</td>
                  {suAdmin && (
                    <td className="p-3 text-right">
                      <Btn variant="ghost" aria-label="মুছুন" onClick={guard(() => void del(u.id))}>
                        <Trash size={16} aria-hidden />
                      </Btn>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
