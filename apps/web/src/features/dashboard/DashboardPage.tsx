import { Suspense, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Medal, Trophy } from '@phosphor-icons/react';
import { fetchBreakdown, fetchCustomerLeaderboard, dhakaWeekStart, fetchDailyIncome, fetchStockCurrent, fetchTotals, fetchWalletBalances, type Totals } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import { formatDhakaDateTime, formatMoney, toBnDigits } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import heroImg from 'assets/images/backgrounds/dashboard-hero.webp';

const Donut = lazy(() => import('components/ui/Donut'));
const IncomeBar = lazy(() => import('components/ui/IncomeBar'));

export default function DashboardPage() {
  usePageTitle('হোম', 'পাতাবিন হোম পাতা: আয়, খরচ, লাভ, স্টক ও হিসাবের সারসংক্ষেপ।');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');

  const totals = useQuery({ queryKey: ['dashboard', 'totals', start, end], queryFn: () => fetchTotals(start, end) });
  const stock = useQuery({ queryKey: ['stock'], queryFn: fetchStockCurrent, staleTime: 30_000 });
  const walletBalances = useQuery({ queryKey: ['dashboard', 'wallet-flows', start, end], queryFn: () => fetchWalletBalances(start, end) });
  const breakdown = useQuery({ queryKey: ['dashboard', 'breakdown', start, end], queryFn: () => fetchBreakdown(start, end) });
  const daily = useQuery({ queryKey: ['dashboard', 'daily', start, end], queryFn: () => fetchDailyIncome(start, end) });
  const donutData = (breakdown.data ?? []).map((s) => ({ name: s.slice, value: s.amount })).filter((d) => d.value !== 0);
  const leaderboard = useQuery({ queryKey: ['dashboard', 'leaderboard', dhakaWeekStart()], queryFn: fetchCustomerLeaderboard, staleTime: 30_000 });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <PageTitle tag="পাতাবিন" title="হোম" />
        <PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
      </div>

      {totals.isPending || stock.isPending ? (
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
            <Stat key={w.wallet_id} label={walletDisplay(w)} value={formatMoney(w.balance)} sub="এই সময়ের প্রবাহ" />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {breakdown.isPending ? <ChartSkeleton /> : <Suspense fallback={<ChartSkeleton />}><Donut title="পেমেন্ট মাধ্যম অনুসারে আয়" data={donutData} centerLabel="আয়" centerValue={formatMoney(totals.data?.income ?? 0)} /></Suspense>}
        {daily.isPending ? <ChartSkeleton /> : <Suspense fallback={<ChartSkeleton />}><IncomeBar data={(daily.data ?? []).map((d) => ({ day: d.day, income: Number(d.income) }))} /></Suspense>}
      </div>

      {leaderboard.isPending ? (
        <ChartSkeleton />
      ) : (leaderboard.data ?? []).length > 0 ? (
        <Card className="p-5">
          <p className="p-label mb-3 text-center">সেরা কাস্টমার (টপ ৫) — এই সপ্তাহ</p>
          <div className="flex flex-col divide-y divide-hairline">
            {leaderboard.data!.map((r, i) => {
              const { Icon, color } = RANK_STYLES[Math.min(i, RANK_STYLES.length - 1)]!;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <Icon weight="fill" size={22} style={{ color }} aria-hidden />
                    <span className="font-semibold">{r.name}</span>
                  </span>
                  <span className="font-semibold">{formatMoney(r.paid)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {totals.isError && <Notice tone="error">ডেটা আনতে সমস্যা হয়েছে।</Notice>}
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
      <p className="p-caption border-t border-hairline p-3">{formatDhakaDateTime(new Date().toISOString())}</p>
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

const RANK_STYLES = [
  { Icon: Crown, color: '#D4AF37' },
  { Icon: Trophy, color: '#9CA3AF' },
  { Icon: Medal, color: '#B87333' },
  { Icon: Medal, color: '#8A6D5C' },
  { Icon: Medal, color: '#C8B79B' },
];
