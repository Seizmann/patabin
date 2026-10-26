import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { fetchPartners, fetchSettings, myPartnerId } from 'lib/api';
import { mapError } from 'lib/errors';
import { formatMoney, toBnDigits } from '@patabin/shared';

type PacketRow = { packet_id: string; packet_code: string; owner_partner_id: string; owner_name: string; remaining: number };

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
    <div className="mx-auto max-w-2xl">
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
    </div>
  );
}
