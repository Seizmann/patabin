import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { formatMoney, toBnDigits } from '@patabin/shared';
import emptySearch from 'assets/images/empty/empty-search.png';

type ReportTab = 'chalan' | 'partner';
type SettlementX = { partner_id: string; partner_name: string; capital: number; ext_rev: number; internal_rev: number; profit: number; entitlement: number };

function partnerTotals(settlement: SettlementX[]) {
  const byPartner = new Map<string, { name: string; capital: number; revenue: number; profit: number; entitlement: number }>();
  for (const x of settlement) {
    const cur = byPartner.get(x.partner_id) ?? { name: x.partner_name, capital: 0, revenue: 0, profit: 0, entitlement: 0 };
    cur.capital += Number(x.capital);
    cur.revenue += Number(x.ext_rev) + Number(x.internal_rev);
    cur.profit += Number(x.profit);
    cur.entitlement += Number(x.entitlement);
    byPartner.set(x.partner_id, cur);
  }
  return byPartner;
}

export default function ReportsPage() {
  usePageTitle('রিপোর্ট');
  const [tab, setTab] = useState<ReportTab>('chalan');
  const [error, setError] = useState('');

  const { data = { chalans: [], partners: [], settlement: [] }, isPending } = useQuery({
    queryKey: ['report-data'],
    queryFn: async () => {
      const [c, p, s] = await Promise.all([
        supabase.from('v_chalan_summary').select('*').order('code', { ascending: false }),
        supabase.from('v_partner_balance').select('*'),
        supabase.from('v_partner_chalan_settlement').select('*'),
      ]);
      if (c.error || p.error || s.error) throw c.error ?? p.error ?? s.error;
      return { chalans: c.data ?? [], partners: (p.data ?? []) as { partner_id: string; partner_name: string; balance: number }[], settlement: s.data ?? [] };
    },
  });

  const exportCsv = async () => {
    setError('');
    if (tab === 'chalan') {
      const csv = [
        ['chalans', 'bought_pcs', 'remaining', 'capital', 'sales', 'expenses'].join(','),
        ...data.chalans.map((x: Record<string, unknown>) => [x.code, x.bought_pcs, x.remaining, x.capital, x.sold_pcs, x.expenses].join(',')),
      ].join('\n');
      download(csv, 'patabin-chalan-report.csv');
    } else {
      const byPartner = partnerTotals(data.settlement as SettlementX[]);
      const csv = [
        ['partner', 'capital', 'revenue', 'profit', 'balance'].join(','),
        ...data.partners.map((p) => {
          const x = byPartner.get(p.partner_id);
          return [p.partner_name, x?.capital ?? 0, x?.revenue ?? 0, x?.profit ?? 0, p.balance].join(',');
        }),
      ].join('\n');
      download(csv, 'patabin-partner-report.csv');
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="রিপোর্ট" right={<Btn variant="ghost" onClick={() => void exportCsv()}>CSV</Btn>} />
      <div className="flex gap-2" role="tablist" aria-label="রিপোর্ট ধরন">
        {(['chalan', 'partner'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} role="tab" aria-selected={tab === t} className={`btn min-h-[44px] ${tab === t ? 'btn-solid' : 'btn-ghost'}`}>
            {t === 'chalan' ? 'চালান অনুসারে' : 'পার্টনার অনুসারে'}
          </button>
        ))}
      </div>

      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!isPending && tab === 'chalan' && <ChalanReport rows={data.chalans} />}
      {!isPending && tab === 'partner' && <PartnerReport rows={data.partners} settlement={data.settlement as SettlementX[]} />}
    </div>
  );
}

function ChalanReport({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <ReportEmpty />;
  return (
    <Table
      head={['চালান', 'কেনা পিস', 'বিক্রি', 'বাকি', 'পুঁজি', 'খরচ']}
      rows={rows.map((x) => [String(x['code'] ?? '-'), toBnDigits(Number(x['bought_pcs'] ?? 0)), toBnDigits(Number(x['sold_pcs'] ?? 0)), toBnDigits(Number(x['remaining'] ?? 0)), formatMoney(Number(x['capital'] ?? 0)), formatMoney(Number(x['expenses'] ?? 0))])}
    />
  );
}

function PartnerReport({ rows, settlement }: { rows: { partner_id: string; partner_name: string; balance: number }[]; settlement: SettlementX[] }) {
  if (!rows.length) return <ReportEmpty />;
  const byPartner = partnerTotals(settlement);
  return (
    <Table
      head={['পার্টনার', 'পুঁজি', 'বিক্রির টাকা', 'লাভ', 'ব্যালেন্স']}
      rows={rows.map((p) => {
        const x = byPartner.get(p.partner_id);
        return [p.partner_name, formatMoney(x?.capital ?? 0), formatMoney(x?.revenue ?? 0), formatMoney(x?.profit ?? 0), formatMoney(p.balance)];
      })}
    />
  );
}

function ReportEmpty() {
  return (
    <Card className="flex flex-col items-center px-8 py-10 text-center">
      <img src={emptySearch} alt="" className="h-40 w-auto object-contain" loading="lazy" />
      <p className="p-title mt-4">রিপোর্টের ডেটা নেই</p>
      <p className="p-caption mt-1">বিক্রি বা চালান হলে এখানে দেখা যাবে।</p>
    </Card>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            {head.map((h) => (
              <th key={h} className="p-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-hairline last:border-0">
              {r.map((c, j) => (
                <td key={j} className="p-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function download(csv: string, name: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
