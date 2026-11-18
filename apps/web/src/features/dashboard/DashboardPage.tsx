import { Suspense, lazy, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Medal, Trophy } from '@phosphor-icons/react';
import { fetchBreakdown, fetchCustomerLeaderboard, dhakaWeekStart, fetchCurrentChalanStart, fetchDailyIncome, fetchPartnerSellSummary, fetchSelfCapital, fetchSelfDailyIncome, fetchStockCurrent, fetchTotals, fetchWalletBalances, type DayRow, type PartnerSellSummary, type Totals } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Card, Notice, Skeleton } from 'components/ui/base';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import { formatDhakaDateTime, formatMoney, toBnDigits } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import { useViewMode, type ViewMode } from 'lib/viewMode';
import heroImg from 'assets/images/backgrounds/dashboard-hero.webp';

const Donut = lazy(() => import('components/ui/Donut'));
const IncomeBar = lazy(() => import('components/ui/IncomeBar'));

export default function DashboardPage() {
  usePageTitle('হোম', 'পাতাবিন হোম পাতা: আয়, খরচ, লাভ, স্টক ও হিসাবের সারসংক্ষেপ।');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');
  const { viewMode, setViewMode, myPartnerId: mine, resolving: partnerResolving } = useViewMode();

  const totals = useQuery({ queryKey: ['dashboard', 'totals', start, end], queryFn: () => fetchTotals(start, end) });
  const stock = useQuery({ queryKey: ['stock'], queryFn: fetchStockCurrent, staleTime: 30_000 });
  const walletBalances = useQuery({ queryKey: ['dashboard', 'wallet-flows', start, end], queryFn: () => fetchWalletBalances(start, end) });
  const breakdown = useQuery({ queryKey: ['dashboard', 'breakdown', start, end], queryFn: () => fetchBreakdown(start, end) });
  const daily = useQuery({ queryKey: ['dashboard', 'daily', start, end], queryFn: () => fetchDailyIncome(start, end) });
  const dailyPrev = useQuery({
    queryKey: ['dashboard', 'daily-prev', daily.data?.[0]?.day, daily.data?.length],
    queryFn: () => {
      const days = daily.data!;
      const first = days[0]!.day;
      const [yy, mm, dd] = first.split('-').map(Number) as [number, number, number];
      const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
      return fetchDailyIncome(fmt(Date.UTC(yy, mm - 1, dd - days.length)), fmt(Date.UTC(yy, mm - 1, dd)));
    },
    enabled: (daily.data?.length ?? 0) > 0,
    staleTime: 30_000,
  });
  const prevDailyPoints = (dailyPrev.data ?? []).map((d) => ({ day: d.day, income: Number(d.income) }));
  const donutData = (breakdown.data ?? []).map((s) => ({ name: s.slice, value: s.amount })).filter((d) => d.value !== 0);
  const partnerBalances = useQuery({ queryKey: ['dashboard', 'partner-sell-summary', start, end], queryFn: () => fetchPartnerSellSummary(start, end) });
  const [leaderMode, setLeaderMode] = useState<'week' | 'chalan'>('week');
  const chalanStart = useQuery({ queryKey: ['dashboard', 'chalan-start'], queryFn: fetchCurrentChalanStart, staleTime: 30_000 });
  const leaderboardSince = leaderMode === 'chalan' ? chalanStart.data ?? null : dhakaWeekStart();
  const leaderboard = useQuery({
    queryKey: ['dashboard', 'leaderboard', leaderMode, leaderboardSince],
    queryFn: () => fetchCustomerLeaderboard(leaderboardSince!),
    enabled: !!leaderboardSince,
    staleTime: 30_000,
  });

  const selfMode = viewMode === 'self';
  const showAll = !selfMode || !mine;

  const selfRow = mine ? (partnerBalances.data ?? []).find((r) => r.partner_id === mine) : undefined;
  const selfCapital = useQuery({
    queryKey: ['dashboard', 'self-capital', start, end, mine],
    queryFn: () => fetchSelfCapital(start, end, mine!),
    enabled: !!mine,
  });
  const selfDaily = useQuery({
    queryKey: ['dashboard', 'self-daily', start, end, mine],
    queryFn: () => fetchSelfDailyIncome(start, end, mine!),
    enabled: !!mine,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <ViewModeToggle mode={viewMode} setMode={setViewMode} />
        <PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} />
      </div>

      {selfMode && !partnerResolving && !mine && (
        <Notice tone="info">আপনার সাথে কোনো পার্টনার প্রোফাইল যুক্ত নেই; সব ডেটা দেখানো হচ্ছে।</Notice>
      )}

      {showAll ? (
        <>
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
            {daily.isPending ? <ChartSkeleton /> : <Suspense fallback={<ChartSkeleton />}><IncomeBar data={(daily.data ?? []).map((d) => ({ day: d.day, income: Number(d.income) }))} prevData={prevDailyPoints} /></Suspense>}
          </div>

          {partnerBalances.isPending ? <ChartSkeleton /> : <PartnerSummaryCard rows={partnerBalances.data ?? []} />}

          {leaderboard.isPending ? (
            <ChartSkeleton />
          ) : (
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="p-label">সেরা কাস্টমার (টপ ৫)</p>
                <div className="flex gap-1 rounded-full border border-hairline bg-surface p-0.5" role="tablist" aria-label="সময়কাল">
                  {(['week', 'chalan'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={leaderMode === m}
                      onClick={() => setLeaderMode(m)}
                      className={`min-h-[32px] rounded-full px-3 text-sm font-semibold transition-colors ${leaderMode === m ? 'bg-espresso text-white' : 'text-ink-mute hover:text-ink'}`}
                    >
                      {m === 'week' ? 'এই সপ্তাহ' : 'চালু চালান'}
                    </button>
                  ))}
                </div>
              </div>
              {leaderMode === 'chalan' && !leaderboardSince ? (
                <p className="p-caption py-4 text-center text-ink-mute">চালু চালান নেই।</p>
              ) : (leaderboard.data ?? []).length === 0 ? (
                <p className="p-caption py-4 text-center text-ink-mute">এই সময়ে কোনো কাস্টমার নেই।</p>
              ) : (
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
              )}
            </Card>
          )}
        </>
      ) : (
        <SelfView row={selfRow} capital={selfCapital.data} capitalPending={selfCapital.isPending} daily={selfDaily.data} dailyPending={selfDaily.isPending} dailyPrev={prevDailyPoints} summaryPending={partnerBalances.isPending} />
      )}

      {totals.isError && <Notice tone="error">ডেটা আনতে সমস্যা হয়েছে।</Notice>}
    </div>
  );
}

function ViewModeToggle({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  return (
    <div className="flex gap-1 rounded-full border border-hairline bg-surface p-1" role="tablist" aria-label="ভিউ মোড">
      {(['all', 'self'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => setMode(m)}
          className={`min-h-[36px] rounded-full px-4 text-sm font-semibold transition-colors ${mode === m ? 'bg-espresso text-white' : 'text-ink-mute hover:text-ink'}`}
        >
          {m === 'all' ? 'সব' : 'শুধু আমি'}
        </button>
      ))}
    </div>
  );
}

function SelfView({ row, capital, capitalPending, daily, dailyPending, dailyPrev, summaryPending }: {
  row?: PartnerSellSummary;
  capital?: number;
  capitalPending: boolean;
  daily?: DayRow[];
  dailyPending: boolean;
  dailyPrev?: { day: string; income: number }[];
  summaryPending: boolean;
}) {
  const sell = row?.sell_revenue ?? 0;
  const expenses = row?.khoroch ?? 0;
  const pcs = row?.remaining_pcs ?? 0;
  const balance = row?.balance ?? 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="আমার বিক্রি" value={summaryPending ? null : formatMoney(sell)} tone="good" />
        <Stat label="আমার খরচ" value={summaryPending ? null : formatMoney(expenses)} tone="bad" />
        <Stat label="আমার বিনিয়োগ" value={capitalPending ? null : formatMoney(capital ?? 0)} />
        <Stat label="আমার স্টক" value={summaryPending ? null : `${toBnDigits(pcs)} পিস`} />
      </div>

      <Card className="overflow-hidden p-5">
        <p className="p-label mb-3 text-center">আমার হিসাব</p>
        <div className="flex flex-col divide-y divide-hairline text-sm">
          <SelfRow label="বিক্রি আয়" value={formatMoney(sell)} />
          <SelfRow label="ব্যক্তিগত ব্যবহার" value={formatMoney(row?.personal_use ?? 0)} />
          <SelfRow label="খরচ" value={formatMoney(expenses)} />
          <SelfRow label="বাকি পিস" value={`${toBnDigits(pcs)} পিস`} />
          <SelfRow label="ব্যালেন্স" value={formatMoney(balance)} strong={balance < 0 ? 'bad' : 'good'} />
        </div>
      </Card>

      {dailyPending ? (
        <ChartSkeleton />
      ) : (
        <Suspense fallback={<ChartSkeleton />}>
          <IncomeBar data={(daily ?? []).map((d) => ({ day: d.day, income: Number(d.income) }))} prevData={dailyPrev} />
        </Suspense>
      )}
    </>
  );
}

function SelfRow({ label, value, strong }: { label: string; value: string; strong?: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-ink-mute">{label}</span>
      <span className={`p-num font-semibold ${strong === 'bad' ? 'text-bad' : strong === 'good' ? 'text-good' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

function PartnerSummaryCard({ rows }: { rows: PartnerSellSummary[] }) {
  if (rows.length === 0) return null;
  const totalBal = rows.reduce((s, r) => s + r.balance, 0);
  const totalPcs = rows.reduce((s, r) => s + r.remaining_pcs, 0);
  return (
    <Card className="overflow-hidden p-5">
      <p className="p-label mb-3 text-center">পার্টনার ব্যালেন্স ও বাকি স্টক</p>
      <div className="flex flex-col divide-y divide-hairline">
        {rows.map((r) => (
          <div key={r.partner_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-semibold">{r.partner_name}</span>
            <span className="flex items-center gap-3">
              <span className="p-caption">{toBnDigits(r.remaining_pcs)} পিস বাকি</span>
              <span className={`p-num min-w-20 text-right font-semibold ${r.balance < 0 ? 'text-bad' : ''}`}>{formatMoney(r.balance)}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span className="font-extrabold">মোট</span>
          <span className="flex items-center gap-3">
            <span className="p-caption">{toBnDigits(totalPcs)} পিস</span>
            <span className={`p-num min-w-20 text-right font-extrabold ${totalBal < 0 ? 'text-bad' : ''}`}>{formatMoney(totalBal)}</span>
          </span>
        </div>
      </div>
    </Card>
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
