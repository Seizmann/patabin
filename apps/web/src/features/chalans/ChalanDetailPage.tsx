import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chalanSettlements, chalanSummary, chalanPurchases, closeChalan, reopenChalan, fetchChalanByCode } from './api';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { mapError } from 'lib/errors';
import { formatDhakaDate, formatMoney } from '@patabin/shared';

export default function ChalanDetailPage() {
  const { code = '' } = useParams();
  usePageTitle(`চালান ${code}`);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chalan = useQuery({ queryKey: ['chalan', code], queryFn: () => fetchChalanByCode(code) });
  const id = chalan.data?.id ?? null;
  const summary = useQuery({ queryKey: ['chalan-summary', id], queryFn: () => chalanSummary(id!), enabled: !!id });
  const settlements = useQuery({ queryKey: ['chalan-settlements', id], queryFn: () => chalanSettlements(id!), enabled: !!id });
  const purchases = useQuery({ queryKey: ['chalan-purchases', id], queryFn: () => chalanPurchases(id!), enabled: !!id });
  const { data: packets } = useQuery({
    queryKey: ['packets', id],
    queryFn: async (): Promise<{ packet_id: string; packet_code: string; owner_name: string; total_pcs: number; remaining: number }[]> => {
      const { data, error } = await supabase.from('v_packet_stock').select('packet_id, packet_code, owner_name, total_pcs, remaining').eq('chalan_id', id).order('packet_code');
      if (error) throw error;
      return (data ?? []) as { packet_id: string; packet_code: string; owner_name: string; total_pcs: number; remaining: number }[];
    },
    enabled: !!id,
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['chalan', code] });
      await qc.invalidateQueries({ queryKey: ['chalan-summary', id] });
      await qc.invalidateQueries({ queryKey: ['chalan-settlements', id] });
      await qc.invalidateQueries({ queryKey: ['packets', id] });
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
          <Btn busy={busy} onClick={() => run(() => closeChalan(id!))}>
            চালান বন্ধ করুন
          </Btn>
        )}
        {closed && (
          <Btn variant="ghost" busy={busy} onClick={() => run(() => reopenChalan(id!))}>
            আবার খুলুন
          </Btn>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      <p className="p-caption">তারিখ: {chalan.data && formatDhakaDate(chalan.data.purchase_date)} · কেনার দাম {chalan.data && formatMoney(chalan.data.buy_rate)}</p>
    </div>
  );
}
