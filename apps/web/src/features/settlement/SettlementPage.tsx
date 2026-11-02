import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Notice, PageTitle, Skeleton } from 'components/ui/base';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import { formatMoney } from '@patabin/shared';

type SettlementRow = {
  chalan_id: string;
  partner_id: string;
  partner_name: string;
  capital: number;
  ext_rev: number;
  internal_rev: number;
  cost: number;
  profit: number;
  consumption_due: number;
  expenses_attributed: number;
  pocket_paid: number;
  entitlement: number;
  pcs_out: number;
};
type ChalanRow = { id: string; code: string; status: string; purchase_date: string };

const ESTIMATE_SELL_RATE = 300;

export default function SettlementPage() {
  usePageTitle('হিসাব মেটানো');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');
  const { data: chalans = [] } = useQuery({
    queryKey: ['chalan-settlement-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chalans').select('id, code, status, purchase_date').is('deleted_at', null).order('code', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChalanRow[];
    },
  });
  const visibleChalans = chalans.filter((c) => c.purchase_date >= start && c.purchase_date < end);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="হিসাব মেটানো"
        right={
          <PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} showAll />
        }
      />
      <Notice tone="info">নিচের হিসাব প্রতি চালানের ভাবে, চালান খোলা অবস্থায় জীবন্ত হিসাব — বন্ধ হলে তখনকার স্ন্যাপশট।</Notice>
      {visibleChalans.length === 0 && <p className="p-caption text-ink-mute">এই সময়ে কোনো চালান নেই।</p>}
      {visibleChalans.map((c) => (
        <ChalanSettlement key={c.id} chalan={c} />
      ))}
    </div>
  );
}

function ChalanSettlement({ chalan }: { chalan: ChalanRow }) {
  const { data: rows, isPending } = useQuery({
    queryKey: ['settlement', chalan.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_partner_chalan_settlement').select('*').eq('chalan_id', chalan.id);
      if (error) throw error;
      return (data ?? []) as SettlementRow[];
    },
    enabled: true,
  });
  const { data: packetPcs = [] } = useQuery({
    queryKey: ['settlement-packet-pcs', chalan.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('packets').select('owner_partner_id, total_pcs').eq('chalan_id', chalan.id).is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as { owner_partner_id: string; total_pcs: number }[];
    },
  });
  const totalPcsBy = (partnerId: string) => packetPcs.filter((p) => p.owner_partner_id === partnerId).reduce((sum, p) => sum + p.total_pcs, 0);

  return (
    <div className="card overflow-x-auto">
      <p className="p-label p-4 pb-0">
        চালান {chalan.code} · {chalan.status === 'open' ? 'চলছে' : 'বন্ধ'}
      </p>
      {isPending ? (
        <div className="p-4">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (rows ?? []).length === 0 ? (
        <p className="p-caption p-4 text-ink-mute">কেনা বা প্যাকেট নেই।</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="p-3 font-semibold">পার্টনার</th>
              <th className="p-3 font-semibold">পুঁজি</th>
              <th className="p-3 font-semibold">বিক্রির টাকা</th>
              <th className="p-3 font-semibold">কস্ট</th>
              <th className="p-3 font-semibold">লাভ</th>
              <th className="p-3 font-semibold">নিজের খরচ</th>
              <th className="p-3 font-semibold">প্রাপ্য</th>
              <th className="p-3 font-semibold">সম্ভাব্য</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((s) => {
              const remainingPcs = totalPcsBy(s.partner_id) - Number(s.pcs_out);
              const estimated = Number(s.entitlement) + remainingPcs * ESTIMATE_SELL_RATE;
              return (
                <tr key={s.chalan_id + s.partner_id} className="border-b border-hairline last:border-0">
                  <td className="p-3">{s.partner_name}</td>
                  <td className="p-3">{formatMoney(s.capital)}</td>
                  <td className="p-3">{formatMoney(Number(s.ext_rev) + Number(s.internal_rev))}</td>
                  <td className="p-3">{formatMoney(s.cost)}</td>
                  <td className="p-3">{formatMoney(s.profit)}</td>
                  <td className="p-3">{formatMoney(Number(s.expenses_attributed) - Number(s.pocket_paid) + Number(s.consumption_due))}</td>
                  <td className="p-3 font-semibold">{formatMoney(s.entitlement)}</td>
                  <td className="p-3">
                    {formatMoney(estimated)}
                    <span className="p-caption block text-ink-mute">বাকি {remainingPcs} পিস × {ESTIMATE_SELL_RATE}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
