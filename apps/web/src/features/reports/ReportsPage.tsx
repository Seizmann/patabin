import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { formatMoney, toBnDigits } from '@patabin/shared';
import emptySearch from 'assets/images/empty/empty-search.png';

type ReportTab = 'batch' | 'partner';

export default function ReportsPage() {
  usePageTitle('রিপোর্ট');
  const [tab, setTab] = useState<ReportTab>('batch');
  const [error, setError] = useState('');

  const { data = { batches: [], partners: [] }, isPending } = useQuery({
    queryKey: ['report-data'],
    queryFn: async () => {
      const [b, p] = await Promise.all([
        supabase.from('v_batch_summary').select('*'),
        supabase.from('v_partner_balance').select('*'),
      ]);
      if (b.error || p.error) throw b.error ?? p.error;
      return { batches: b.data ?? [], partners: (p.data ?? []) as { partner_id: string; partner_name: string; entitlement: number; cash_held: number; balance: number }[] };
    },
  });

  const exportCsv = async () => {
    setError('');
    if (tab === 'batch') {
      const csv = [
        ['code', 'total_pcs', 'remaining', 'revenue_external', 'revenue_internal', 'operating_expenses', 'profit'].join(','),
        ...data.batches.map((x: Record<string, unknown>) => [x.batch_id, x.total_pcs, x.remaining, x.revenue_external, x.revenue_internal, x.operating_expenses].join(',')),
      ].join('\n');
      download(csv, `patabin-batch-report.csv`);
    } else {
      const csv = [['partner', 'entitlement', 'cash_held', 'balance'].join(','), ...data.partners.map((x) => [x.partner_name, x.entitlement, x.cash_held, x.balance].join(','))].join('\n');
      download(csv, 'patabin-partner-report.csv');
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="রিপোর্ট"
        right={<Btn variant="ghost" onClick={() => void exportCsv()}>CSV</Btn>}
      />
      <div className="flex gap-2" role="tablist" aria-label="রিপোর্ট ধরন">
        {(['batch', 'partner'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} role="tab" aria-selected={tab === t} className={`btn min-h-[44px] ${tab === t ? 'btn-solid' : 'btn-ghost'}`}>
            {t === 'batch' ? 'ব্যাচ অনুসারে' : 'পার্টনার অনুসারে'}
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
      {!isPending && tab === 'batch' && <BatchReport rows={data.batches} />}
      {!isPending && tab === 'partner' && <PartnerReport rows={data.partners} />}
    </div>
  );
}

function BatchReport({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <ReportEmpty />;
  return (
    <Table
      head={['ব্যাচ', 'খোলা তারিখ', 'মোট পিস', 'বাকি', 'আয় (বাহির+ভেতর)', 'লাভ']}
      rows={rows.map((x) => [String(x['batch_id'] ?? ''), '-', toBnDigits(Number(x['total_pcs'] ?? 0)), toBnDigits(Number(x['remaining'] ?? 0)), formatMoney(Number(x['revenue_external'] ?? 0) + Number(x['revenue_internal'] ?? 0)), formatMoney(Number(x['profit']) || 0)])}
    />
  );
}

function PartnerReport({ rows }: { rows: { partner_name: string; entitlement: number; cash_held: number; balance: number }[] }) {
  if (!rows.length) return <ReportEmpty />;
  return (
    <Table
      head={['পার্টনার', 'প্রাপ্য', 'হাতে টাকা', 'ব্যালেন্স']}
      rows={rows.map((x) => [x.partner_name, formatMoney(x.entitlement), formatMoney(x.cash_held), formatMoney(x.balance)])}
    />
  );
}

function ReportEmpty() {
  return (
    <Card className="flex flex-col items-center px-8 py-10 text-center">
      <img src={emptySearch} alt="" className="h-40 w-auto object-contain" loading="lazy" />
      <p className="p-title mt-4">রিপোর্টের ডেটা নেই</p>
      <p className="p-caption mt-1">বিক্রি বা ব্যাচ হলে এখানে দেখা যাবে।</p>
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
