import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Empty, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { formatMoney } from '@patabin/shared';
import emptySettlements from 'assets/images/empty/empty-settlements.png';

type BalanceRow = { partner_id: string; partner_name: string; balance: string | number };
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
};
type ChalanRow = { id: string; code: string; status: string };

export default function SettlementPage() {
  usePageTitle('হিসাব মেটানো');
  const { data: balances, isPending: balancesPending } = useQuery({ queryKey: ['balances'], queryFn: fetchBalances });
  const { data: chalans = [] } = useQuery({
    queryKey: ['chalan-settlement-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chalans').select('id, code, status').is('deleted_at', null).order('code', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChalanRow[];
    },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="হিসাব মেটানো" />
      {balancesPending && <Skeleton className="h-24 w-full" />}
      {balances?.length === 0 && <Empty img={emptySettlements} title="কেউ কাউকে দেবে না" caption="সব হিসাব মিলে আছে।" />}
      {balances && balances.length > 0 && (
        <div className="card p-5">
          <p className="p-label mb-3">কে কাকে কত দেবে</p>
          <div className="flex flex-col divide-y divide-hairline">
            {balances.map((b) => (
              <div key={b.partner_id} className="flex items-center justify-between py-2">
                <span className="p-caption font-medium">{b.partner_name}</span>
                <span className={`p-num font-semibold ${Number(b.balance) >= 0 ? 'text-good' : 'text-bad'}`}>
                  {Number(b.balance) === 0 ? 'হিসাব মেটানো' : Number(b.balance) > 0 ? `পাবে ${formatMoney(b.balance)}` : `দেবে ${formatMoney(-Number(b.balance))}`}
                </span>
              </div>
            ))}
            {balances.length === 2 && numberSentence(balances) && (
              <div className="p-caption mt-3 rounded-xl bg-canvas px-4 py-3">{numberSentence(balances)}</div>
            )}
          </div>
          <Link to="/wallets" className="btn mt-4 inline-block">
            ওয়ালেট দেখুন
          </Link>
        </div>
      )}

      <Notice tone="info">নিচের হিসাব প্রতি চালানের ভাবে, চালান খোলা অবস্থায় জীবন্ত হিসাব — বন্ধ হলে তখনকার স্ন্যাপশট।</Notice>
      {chalans.map((c) => (
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
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((s) => (
              <tr key={s.chalan_id + s.partner_id} className="border-b border-hairline last:border-0">
                <td className="p-3">{s.partner_name}</td>
                <td className="p-3">{formatMoney(s.capital)}</td>
                <td className="p-3">{formatMoney(Number(s.ext_rev) + Number(s.internal_rev))}</td>
                <td className="p-3">{formatMoney(s.cost)}</td>
                <td className="p-3">{formatMoney(s.profit)}</td>
                <td className="p-3">{formatMoney(Number(s.expenses_attributed) - Number(s.pocket_paid) + Number(s.consumption_due))}</td>
                <td className="p-3 font-semibold">{formatMoney(s.entitlement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function numberSentence(balances: BalanceRow[]): string {
  const [a] = balances.filter((b) => Number(b.balance) !== 0);
  const b2 = balances.find((x) => x.balance !== a?.balance);
  if (!a || !b2 || Number(a.balance) * Number(b2.balance) >= 0) return '';
  const receiver = Number(a.balance) > 0 ? a : b2;
  const payer = Number(a.balance) > 0 ? b2 : a;
  return `${payer.partner_name} কে ${receiver.partner_name} ${formatMoney(Number(payer.balance) ? Number(payer.balance) : -Number(receiver.balance))} দেবে।`;
}

async function fetchBalances() {
  const { data, error } = await supabase.from('v_partner_balance').select('*').order('partner_name');
  if (error) throw error;
  return (data ?? []) as BalanceRow[];
}
