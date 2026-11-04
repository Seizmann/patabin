import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chalanSettlements, chalanSummary, chalanPurchases, closeChalan, reopenChalan, fetchChalanByCode, adjustChalanPurchase, type PurchaseRow, type SettlementRow } from './api';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import { mapError } from 'lib/errors';
import { useWriteGuard } from 'hooks/useWriteGuard';
import { formatDhakaDate, formatMoney } from '@patabin/shared';

export default function ChalanDetailPage() {
  const { code = '' } = useParams();
  usePageTitle(`চালান ${code}`);
  const qc = useQueryClient();
  const { guard, denied } = useWriteGuard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chalan = useQuery({ queryKey: ['chalan', code], queryFn: () => fetchChalanByCode(code) });
  const id = chalan.data?.id ?? null;
  const summary = useQuery({ queryKey: ['chalan-summary', id], queryFn: () => chalanSummary(id!), enabled: !!id });
  const settlements = useQuery({ queryKey: ['chalan-settlements', id], queryFn: () => chalanSettlements(id!), enabled: !!id });
  const purchases = useQuery({ queryKey: ['chalan-purchases', id], queryFn: () => chalanPurchases(id!), enabled: !!id });
  const { data: packets } = useQuery({
    queryKey: ['packets', id],
    queryFn: async (): Promise<{ packet_id: string; packet_code: string; owner_partner_id: string; owner_name: string; total_pcs: number; remaining: number }[]> => {
      const { data, error } = await supabase.from('v_packet_stock').select('packet_id, packet_code, owner_partner_id, owner_name, total_pcs, remaining').eq('chalan_id', id).order('packet_code');
      if (error) throw error;
      return (data ?? []) as { packet_id: string; packet_code: string; owner_partner_id: string; owner_name: string; total_pcs: number; remaining: number }[];
    },
    enabled: !!id,
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['chalan', code] });
      await qc.invalidateQueries({ queryKey: ['chalans'] });
      await qc.invalidateQueries({ queryKey: ['chalans-period-meta'] });
      await qc.invalidateQueries({ queryKey: ['chalan-summary', id] });
      await qc.invalidateQueries({ queryKey: ['chalan-settlements', id] });
      await qc.invalidateQueries({ queryKey: ['packets', id] });
      await qc.invalidateQueries({ queryKey: ['open-chalan-guard'] });
      await qc.invalidateQueries({ queryKey: ['open-chalan-pack'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const closed = chalan.data?.status === 'closed';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="চালান" title={`চালান ${code}`} right={<span className="p-caption">{closed ? 'বন্ধ' : 'চলছে'}</span>} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'কেনা পিস', value: summary.data?.bought_pcs },
          { label: 'বাকি', value: summary.data?.remaining },
          { label: 'বিক্রি', value: summary.data?.sold_pcs },
          { label: 'খরচ', value: summary.data?.expenses },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="p-label">{s.label}</p>
            <p className="p-title">{s.value === undefined ? '-' : s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <p className="p-label mb-3">কেনা</p>
        {purchases.data?.map((p) => (
          <div key={p.id} className="flex justify-between border-b border-hairline py-2 last:border-0">
            <span>{settlements.data?.find((s) => s.partner_id === p.partner_id)?.partner_name ?? '-'}</span>
            <span>
              {p.qty} পিস · {formatMoney(p.amount_paid)}
            </span>
          </div>
        ))}
        {purchases.data?.length === 0 && <p className="p-caption">কিছু নেই</p>}
      </Card>

      {!closed && id && purchases.data && settlements.data && packets && (
        <AdjustCard chalanId={id} purchases={purchases.data} settlements={settlements.data} packets={packets} />
      )}

      <Card className="p-5">
        <p className="p-label mb-3">প্যাকেট</p>
        <div className="flex flex-col divide-y divide-hairline">
          {(packets ?? []).map((p) => (
            <div key={p.packet_id} className="flex justify-between py-2 text-sm">
              <span>
                {p.owner_name} · {p.packet_code}
              </span>
              <span>
                {p.remaining}/{p.total_pcs} পিস
              </span>
            </div>
          ))}
          {(packets ?? []).length === 0 && <p className="p-caption text-ink-mute">প্যাকেট হয়নি; প্যাকেট পাতা থেকে প্যাকিং করুন।</p>}
        </div>
      </Card>

      <Card className="p-5">
        <p className="p-label mb-3">হিসাব{closed ? ' (বন্ধের ক্ষণে)' : ''}</p>
        {settlements.isPending && <Skeleton />}
        <div className="flex flex-col divide-y divide-hairline">
          {(settlements.data ?? []).map((s) => (
            <div key={s.partner_id} className="py-2 text-sm">
              <div className="flex justify-between font-semibold">
                <span>{s.partner_name}</span>
                <span className={Number(s.entitlement) >= 0 ? 'text-good' : 'text-bad'}>{formatMoney(s.entitlement)}</span>
              </div>
              <p className="p-caption text-ink-mute">
                পুঁজি {formatMoney(s.capital)} · বিক্রির টাকা {formatMoney(s.ext_rev)} · খরচ (কস্ট) {formatMoney(s.cost)} · নিজের খরচ {formatMoney(s.expenses_attributed)} · ওনার ব্যবহার {formatMoney(s.consumption_due)} · লাভ {formatMoney(s.profit)}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        {!closed && (
          <Btn busy={busy} onClick={guard(() => run(() => closeChalan(id!)))}>
            চালান বন্ধ করুন
          </Btn>
        )}
        {closed && (
          <Btn variant="ghost" busy={busy} onClick={guard(() => run(() => reopenChalan(id!)))}>
            আবার খুলুন
          </Btn>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      {denied}
      <p className="p-caption">তারিখ: {chalan.data && formatDhakaDate(chalan.data.purchase_date)} · কেনার দাম {chalan.data && formatMoney(chalan.data.buy_rate)}</p>
    </div>
  );
}

type PacketRow = { packet_id: string; packet_code: string; owner_partner_id: string; owner_name: string; total_pcs: number; remaining: number };

function AdjustCard({ chalanId, purchases, settlements, packets }: { chalanId: string; purchases: PurchaseRow[]; settlements: SettlementRow[]; packets: PacketRow[] }) {
  const qc = useQueryClient();
  const { guard, denied } = useWriteGuard();
  const [partnerId, setPartnerId] = useState('');
  const [mode, setMode] = useState<'add' | 'sub'>('add');
  const [pcs, setPcs] = useState('');
  const [cuts, setCuts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const qty = Number(pcs || 0);
  const purchase = purchases.find((p) => p.partner_id === partnerId);
  const myPackets = packets.filter((p) => p.owner_partner_id === partnerId);
  const packed = myPackets.reduce((a, p) => a + p.total_pcs, 0);
  const unpacked = Math.max((purchase?.qty ?? 0) - packed, 0);
  const needed = mode === 'sub' ? Math.max(qty - unpacked, 0) : 0;
  const packetCuts = Object.entries(cuts)
    .map(([packet_id, v]) => ({ packet_id, qty: Number(v) || 0 }))
    .filter((c) => c.qty > 0);
  const cutsSum = packetCuts.reduce((a, c) => a + c.qty, 0);
  const valid = !!partnerId && qty > 0 && (mode === 'add' || (!!purchase && qty <= purchase.qty)) && (needed === 0 || cutsSum === needed);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!valid) return;
    setBusy(true);
    try {
      await adjustChalanPurchase(chalanId, partnerId, mode === 'add' ? qty : -qty, needed > 0 ? packetCuts : undefined);
      await Promise.all(['chalan', 'packets', 'balances', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      setOk(mode === 'add' ? 'পরিমাণ বাড়ানো হয়েছে' : 'পরিমাণ কমানো হয়েছে');
      setPcs('');
      setCuts({});
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <Card className="p-6">
      <p className="p-label mb-4">পরিমাণ বাড়ান / কমান</p>
      <form onSubmit={guard(submit)} noValidate className="grid grid-cols-2 gap-4">
        <Field label="পার্টনার">
          <select className="field" value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setCuts({}); setOk(''); }}>
            <option value="">-- নির্বাচন করুন --</option>
            {settlements.map((s) => (
              <option key={s.partner_id} value={s.partner_id}>
                {s.partner_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="কী করবেন">
          <select className="field" value={mode} onChange={(e) => { setMode(e.target.value as 'add' | 'sub'); setCuts({}); setOk(''); }}>
            <option value="add">বাড়ান</option>
            <option value="sub">কমান</option>
          </select>
        </Field>
        <Field label="পরিমাণ (পিস)">
          <NumberInput value={pcs} onChange={setPcs} />
        </Field>
        <div className="p-caption self-end rounded-xl bg-canvas px-3 py-2">
          {mode === 'add'
            ? `কেনার দাম অনুযায়ী টাকাও যোগ হবে`
            : partnerId
              ? `আন-প্যাকড আছে ${unpacked} পিস`
              : '—'}
        </div>
        {mode === 'sub' && needed > 0 && (
          <div className="col-span-2 flex flex-col gap-2 rounded-xl bg-canvas p-4">
            <p className="p-caption">
              আন-প্যাকড শেষ; বাকি <b>{needed}</b> পিস কোন কোন প্যাকেট থেকে কাটা হবে বাছুন (মোট বাছাই হয়েছে {cutsSum})।
            </p>
            {myPackets.map((p) => (
              <div key={p.packet_id} className="flex items-center gap-3">
                <span className="grow text-sm">
                  {p.packet_code} · বাকি {p.remaining} পিস
                </span>
                <div className="w-24">
                  <NumberInput value={cuts[p.packet_id] ?? ''} onChange={(v) => setCuts((c) => ({ ...c, [p.packet_id]: v }))} />
                </div>
              </div>
            ))}
            {myPackets.length === 0 && <p className="p-caption text-ink-mute">এই পার্টনারের কোনো প্যাকেট নেই।</p>}
          </div>
        )}
        <div className="col-span-2 flex items-center gap-3">
          <Btn type="submit" busy={busy} disabled={!valid}>
            সংরক্ষণ করুন
          </Btn>
          {ok && <Notice tone="ok">{ok}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </form>
      {denied}
    </Card>
  );
}
