import { Suspense, lazy, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBalances, fetchBreakdown, fetchDailyIncome, fetchStockCurrent, fetchTotals, fetchWalletBalances, type Totals } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { dhakaDate, formatDhakaDate, formatMoney, periodRange, toBnDigits } from '@patabin/shared';
import { supabase } from 'lib/supabase';
import heroImg from 'assets/images/backgrounds/dashboard-hero.webp';
import offlineImg from 'assets/images/empty/offline.png';
import emptySales from 'assets/images/empty/empty-sales.png';

const Donut = lazy(() => import('components/ui/Donut'));
const IncomeBar = lazy(() => import('components/ui/IncomeBar'));

type PeriodId = 'chalan' | 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom';

const periods: { id: PeriodId; label: string }[] = [
  { id: 'chalan', label: 'এই চালান' },
  { id: 'today', label: 'আজ' },
  { id: 'yesterday', label: 'গতকাল' },
  { id: 'week', label: 'এই সপ্তাহ' },
  { id: 'month', label: 'এই মাস' },
  { id: 'lastMonth', label: 'গত মাস' },
];

export default function DashboardPage() {
  usePageTitle('হোম', 'পাতাবিন হোম পাতা: আয়, খরচ, লাভ, স্টক ও হিসাবের সারসংক্ষেপ।');
  const [period, setPeriod] = useState<PeriodId>('chalan');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: openChalan } = useQuery({
    queryKey: ['dashboard', 'open-chalan'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chalans')
        .select('code, purchase_date')
        .eq('status', 'open')
        .is('deleted_at', null)
        .order('code', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data ?? [])[0] as { code: string; purchase_date: string } | undefined;
    },
  });

  const [start, end] = useMemo(() => {
    if (period === 'chalan') {
      const nowIso = new Date().toISOString();
      return openChalan?.purchase_date ? [openChalan.purchase_date, nowIso] : periodRange('today', nowIso);
    }
    if (period === 'custom') {
      const now = dhakaDate(new Date().toISOString());
      const endIso = customTo ? `${customTo}T23:59:59+06:00` : new Date().toISOString();
      return [customFrom ? `${customFrom}T00:00:00+06:00` : `${now}T00:00:00+06:00`, endIso];
    }
    return periodRange(period, new Date().toISOString());
  }, [period, customFrom, customTo, openChalan?.purchase_date]);

  const totals = useQuery({ queryKey: ['dashboard', 'totals', start, end], queryFn: () => fetchTotals(start, end) });
  const stock = useQuery({ queryKey: ['stock'], queryFn: fetchStockCurrent, staleTime: 30_000 });
  const balances = useQuery({ queryKey: ['balances'], queryFn: fetchBalances });
  const walletBalances = useQuery({ queryKey: ['wallets-all'], queryFn: fetchWalletBalances });
  const breakdown = useQuery({ queryKey: ['dashboard', 'breakdown', start, end], queryFn: () => fetchBreakdown(start, end) });
  const daily = useQuery({ queryKey: ['dashboard', 'daily', start, end], queryFn: () => fetchDailyIncome(start, end) });

  const donutData = (breakdown.data ?? []).map((s) => ({ name: s.slice, value: s.amount })).filter((d) => d.value !== 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <PageTitle tag="পাতাবিন" title="হোম" />
        <PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
      </div>

      {totals.isPending || stock.isPending || balances.isPending ? (
        <StatSkeletons />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="আয়" value={totals.data && formatMoney(totals.data.income)} tone="good" />
          <Stat label="খরচ" value={totals.data && formatMoney(totals.data.expenses)} tone="bad" />
          <Stat label="নিট লাভ" value={totals.data && formatMoney(totals.data.net_profit)} tone={Number(totals.data?.net_profit ?? 0) >= 0 ? 'good' : 'bad'} />
          <Stat label="স্টক" value={`${toBnDigits(stock.data ?? 0)} পিস`} />
        </div>
      )}

      <HeroCard totals={totals.data} loading={totals.isPending} cash={totals.data ? totals.data.cash_received : 0} />

      {walletBalances.data && walletBalances.data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {walletBalances.data.map((w) => (
            <Stat key={w.wallet_id} label={w.type === 'cash' ? 'ক্যাশ' : w.type === 'bkash' ? `বিকাশ · ${w.label}` : `নগদ · ${w.label}`} value={formatMoney(w.balance)} />
          ))}
        </div>
      )}

      {balances.data && balances.data.length > 0 && (
        <Card className="p-5">
          <p className="p-label mb-3">কে কাকে কত দেবে</p>
          <div className="flex flex-col divide-y divide-hairline">
            {balances.data.map((b) => (
              <div key={b.partner_id} className="flex items-center justify-between py-2">
                <span className="p-caption font-medium">{b.partner_name}</span>
                <span className={`p-num font-semibold ${Number(b.balance) >= 0 ? 'text-good' : 'text-bad'}`}>
                  {Number(b.balance) === 0 ? 'হিসাব মেটানো' : Number(b.balance) > 0 ? `পাবে ${formatMoney(b.balance)}` : `দেবে ${formatMoney(-Number(b.balance))}`}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {breakdown.isPending ? <ChartSkeleton /> : <Suspense fallback={<ChartSkeleton />}><Donut title="পেমেন্ট মাধ্যম অনুসারে আয়" data={donutData} centerLabel="আয়" centerValue={formatMoney(totals.data?.income ?? 0)} /></Suspense>}
        {daily.isPending ? <ChartSkeleton /> : <Suspense fallback={<ChartSkeleton />}><IncomeBar data={(daily.data ?? []).map((d) => ({ day: d.day, income: Number(d.income) }))} /></Suspense>}
      </div>

      {totals.isError && <Notice tone="error">ডেটা আনতে সমস্যা হয়েছে।</Notice>}
      <p className="p-caption flex items-center gap-2">
        <img src={offlineImg} alt="" className="hidden" aria-hidden />
        হালনাগাদ: {formatDhakaDate(new Date().toISOString())} ({toBnDigits(start.slice(0, 10))} থেকে {toBnDigits(end.slice(0, 10))})
        <img src={emptySales} alt="" className="hidden" aria-hidden />
      </p>
    </div>
  );
}

function PeriodSelect({ period, setPeriod, customFrom, customTo, setCustomFrom, setCustomTo }: {
  period: PeriodId;
  setPeriod: (p: PeriodId) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <select aria-label="সময়কাল" className="field min-h-[44px] w-auto py-1.5" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value="custom">নিজের সময়</option>
      </select>
      {period === 'custom' && (
        <div className="flex items-end gap-2">
          <input type="date" aria-label="থেকে" className="field w-36 min-h-[44px] py-1.5" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <input type="date" aria-label="পর্যন্ত" className="field w-36 min-h-[44px] py-1.5" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value?: string | null; tone?: 'good' | 'bad'; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="p-label">{label}</p>
      <p className={`p-num mt-2 text-2xl font-extrabold ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink'}`}>
        {value ?? '-'}
      </p>
      {sub ? <p className="p-caption mt-1">{sub}</p> : null}
    </div>
  );
}

function HeroCard({ totals, loading, cash }: { totals: Totals | undefined; loading: boolean; cash: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative min-h-44">
        <img src={heroImg} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative flex flex-wrap items-end justify-between gap-6 bg-gradient-to-t from-black/60 to-black/10 p-6 text-white">
          <div>
            <p className="p-label text-white/80">তালিকা মূল্য (সব বিক্রি)</p>
            <p className="p-num text-3xl font-extrabold">{loading ? <Skeleton className="h-8 w-36 bg-white/30" /> : formatMoney(totals?.list_value ?? 0)}</p>
          </div>
          <div>
            <p className="p-label text-white/80">নগদ (বাহির বিক্রি)</p>
            <p className="p-num text-3xl font-extrabold">{loading ? <Skeleton className="h-8 w-36 bg-white/30" /> : formatMoney(cash)}</p>
          </div>
        </div>
      </div>
      <p className="p-caption border-t border-hairline p-3">{formatDhakaDate(new Date().toISOString())}</p>
    </Card>
  );
}

function StatSkeletons() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="card p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="card p-5" aria-busy>
      <Skeleton className="mx-auto h-3 w-36" />
      <Skeleton className="mx-auto mt-4 h-44 w-44 rounded-full" />
    </div>
  );
}
