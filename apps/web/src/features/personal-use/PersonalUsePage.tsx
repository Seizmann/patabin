import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { fetchPartners, fetchSettings, myPartnerId } from 'lib/api';
import { mapError } from 'lib/errors';
import { formatDhakaDate, formatMoney, toBnDigits } from '@patabin/shared';
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
  partners: { name: string } | null;
  packets: { code: string; partners: { name: string } | null } | null;
  chalans: { code: string } | null;
};

async function fetchPersonalUses(): Promise<PersonalUseRow[]> {
  const { data, error } = await supabase
    .from('personal_uses')
    .select('id, at, qty, unit_value, note, packet_id, chalan_id, partners(name), packets(code, partners(name)), chalans(code)')
    .is('deleted_at', null)
    .order('at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PersonalUseRow[];
}

export default function PersonalUsePage() {
  usePageTitle('ব্যক্তিগত ব্যবহার');
  const qc = useQueryClient();
  const [ eater, setEater ] = useState('');
  const [packetId, setPacketId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: myId } = useQuery({ queryKey: ['my-partner'], queryFn: myPartnerId });
  const { data: packets = [] } = useQuery({
    queryKey: ['packets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_packet_stock').select('packet_id, packet_code, owner_partner_id, owner_name, remaining').gt('remaining', 0);
      if (error) throw error;
      return (data ?? []) as PacketRow[];
    },
  });
  const { data: uses = [], isPending: usesPending } = useQuery({ queryKey: ['personal-uses'], queryFn: fetchPersonalUses });

  const chosen = packets.find((p) => p.packet_id === packetId) ?? null;
  const ownerIsOther = chosen && chosen.owner_partner_id !== (eater || myId);
  const value = Number(qty || '0') * Number(unit || settings?.default_sell_price || 300);

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
      await qc.invalidateQueries({ queryKey: ['packets'] });
      await qc.invalidateQueries({ queryKey: ['personal-uses'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOk('সংরক্ষিত');
      setQty('');
      setNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Card className="flex flex-col gap-5 p-6">
        <PageTitle tag="PataBin" title="ব্যক্তিগত ব্যবহার" />
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field label="কে খাচ্ছে">
            <select className="field" value={eater} onChange={(e) => setEater(e.target.value)}>
              <option value="">{myId ? partners.find((p) => p.id === myId)?.name ?? 'নিজে' : 'নিজে'}</option>
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
          {ok && <Notice tone="ok">{ok}</Notice>}
          <Btn type="submit" busy={busy} disabled={!Number(qty)}>
            সংরক্ষণ করুন
          </Btn>
        </form>
      </Card>

      {usesPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
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
              </tr>
            </thead>
            <tbody>
              {uses.map((u) => (
                <tr key={u.id} className="border-b border-hairline last:border-0">
                  <td className="whitespace-nowrap p-3">{formatDhakaDate(u.at)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
