import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchBatches } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { formatDhakaDate, formatMoney, toBnDigits } from '@patabin/shared';
import emptyBatches from 'assets/images/empty/empty-batches.png';

export default function BatchesPage() {
  usePageTitle('ব্যাচ');
  const nav = useNavigate();
  const { data, isPending, isError, error } = useQuery({ queryKey: ['batches'], queryFn: fetchBatches });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="ব্যাচ"
        right={<Btn onClick={() => nav('/batches/new')}>নতুন ব্যাচ</Btn>}
      />
      {isPending && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-24 w-full" />
          ))}
        </div>
      )}
      {isError && <Notice tone="error">{error instanceof Error ? error.message : 'সমস্যা'}</Notice>}
      {data?.length === 0 && (
        <Empty img={emptyBatches} title="কোনো ব্যাচ নেই" caption="প্রথম পারচেজ ব্যাচ খুলে শুরু করুন।" />
      )}
      {data && data.length > 0 && <BatchList data={data} />}
    </div>
  );
}

function BatchList({ data }: { data: Awaited<ReturnType<typeof fetchBatches>> }) {
  const nav = useNavigate();
  return (
    <div className="flex flex-col gap-3">
      {data.map((b) => (
        <button key={b.id} type="button" onClick={() => nav(`/batches/${b.code}`)} className="card block p-5 text-left transition-colors hover:border-cocoa">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="p-title">{b.code}</p>
            <StatusChip status={b.status} />
          </div>
          <div className="p-caption flex flex-wrap gap-x-6 gap-y-1">
            <span>{formatDhakaDate(b.purchase_date)} · স্টক {toBnDigits(b.remaining ?? 0)}/{toBnDigits(b.total_pcs ?? 0)} পিস</span>
            {b.revenue !== undefined && b.revenue !== null && <span>আয় {formatMoney(b.revenue)}</span>}
            {b.profit !== undefined && b.profit !== null && <span>লাভ {formatMoney(b.profit)}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls = status === 'open' ? 'bg-good/10 text-good' : 'bg-espresso/10 text-ink-mute';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      {status === 'open' ? 'খোলা' : 'বন্ধ'}
    </span>
  );
}
