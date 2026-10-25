import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { closeBatch, fetchBatchDetail, mapError, reopenBatch } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { formatDhakaDate, formatMoney, toBnDigits } from '@patabin/shared';

export default function BatchDetailPage() {
  const { code = '' } = useParams();
  usePageTitle(`ব্যাচ ${code}`);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data, isPending, isError, error: loadError } = useQuery({
    queryKey: ['batch', code],
    queryFn: () => fetchBatchDetail(code),
  });

  const act = async (fn: 'close' | 'reopen') => {
    if (!data) return;
    setError('');
    if (fn === 'close' && !window.confirm('ব্যাচ বন্ধ করা হবে; হিসাব স্ন্যাপশট প্রতিলিপি রাখা হবে। নিশ্চিত?')) return;
    setBusy(true);
    try {
      await (fn === 'close' ? closeBatch(data.batch.id) : reopenBatch(data.batch.id));
      await qc.invalidateQueries({ queryKey: ['batch', code] });
      await qc.invalidateQueries({ queryKey: ['batches'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
    } catch (e) {
      setError(mapError(e));
    }
    setBusy(false);
  };

  if (isPending) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4" aria-busy>
        <Skeleton className="h-12 w-56" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Notice tone="error">{loadError instanceof Error && loadError.message === 'BATCH_NOT_FOUND' ? 'ব্যাচ পাওয়া যায়নি।' : 'ডেটা আনতে সমস্যা হয়েছে।'}</Notice>
      </div>
    );
  }

  const { batch, stock, summary, payouts, expenses, adjustments } = data;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title={`ব্যাচ ${batch.code}`}
        right={
          <div className="flex items-center gap-2">
            <Chip status={batch.status} />
            {batch.status === 'open' ? (
              <Btn busy={busy} onClick={() => void act('close')}>
                ব্যাচ বন্ধ করুন
              </Btn>
            ) : (
              <Btn variant="ghost" busy={busy} onClick={() => void act('reopen')}>
                আবার খুলুন
              </Btn>
            )}
          </div>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="মোট পিস">{toBnDigits(Number(stock?.total_pcs ?? 0))}</Stat>
        <Stat label="বাকি স্টক">{toBnDigits(Number(stock?.remaining ?? 0))}</Stat>
        <Stat label="ল্যান্ডেড কস্ট/পিস">{summary?.landed_cost_per_pc != null ? formatMoney(summary.landed_cost_per_pc) : '-'}</Stat>
        <Stat label="লাভ" tone={Number(summary?.profit ?? 0) >= 0 ? 'good' : 'bad'}>
          {summary?.profit != null ? formatMoney(summary.profit) : '-'}
        </Stat>
      </div>

      <Card className="p-5">
        <p className="p-label mb-3">হিসাব সারসংক্ষেপ</p>
        <div className="grid grid-cols-2 gap-3 p-caption lg:grid-cols-3">
          <Line label="আয় (বাহির + ভেতরের)">{formatMoney(Number(summary?.revenue_external ?? 0) + Number(summary?.revenue_internal ?? 0))}</Line>
          <Line label="ব্যবহৃত কস্ট">{formatMoney(Number(summary?.landed_cost_per_pc ?? 0) * (Number(stock?.sold_ext ?? 0) + Number(stock?.personal ?? 0) + Number(stock?.damaged ?? 0)))}</Line>
          <Line label="অবিক্রীত স্টক কস্ট">{formatMoney(Number(summary?.landed_cost_per_pc ?? 0) * Number(stock?.remaining ?? 0))}</Line>
          <Line label="অপারেটিং খরচ">{formatMoney(summary?.operating_expenses ?? 0)}</Line>
          <Line label="কেনা তারিখ">{formatDhakaDate(batch.purchase_date)}</Line>
        </div>
      </Card>

      <Card className="p-5">
        <p className="p-label mb-3">পার্টনার প্রাপ্য</p>
        <div className="flex flex-col divide-y divide-hairline">
          {payouts.map((p) => (
            <div key={p.partner_id} className="flex items-center justify-between py-2">
              <span className="p-caption font-medium">{p.partner_name} ({toBnDigits(Math.round(Number(p.contribution_share) * 1000) / 10)}%)</span>
              <span className={`p-num font-semibold ${Number(p.payout) >= 0 ? 'text-good' : 'text-bad'}`}>{formatMoney(p.payout)}</span>
            </div>
          ))}
          {payouts.length === 0 && <p className="p-caption">তথ্য নেই।</p>}
        </div>
      </Card>

      <Card className="p-5">
        <p className="p-label mb-3">খরচ</p>
        <div className="flex flex-col divide-y divide-hairline">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-2">
              <span className="p-caption">
                {formatDhakaDate(e.spent_on)} · {catToBn(e.category)}{e.cost_type === 'landed' ? ' · কস্টে যুক্ত' : ' · অপারেটিং'} · {fundToBn(e.funding)}
              </span>
              <span className="p-num">{formatMoney(e.amount)}</span>
            </div>
          ))}
          {expenses.length === 0 && <p className="p-caption">কোনো খরচ নেই।</p>}
        </div>
      </Card>

      <Card className="p-5">
        <p className="p-label mb-3">নষ্ট/ক্ষতি</p>
        <div className="flex flex-col divide-y divide-hairline">
          {adjustments.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2">
              <span className="p-caption">
                {formatDhakaDate(a.adjusted_on)} · {reasonToBn(a.reason)} · {toBnDigits(a.qty)} পিস
              </span>
              <span className="p-num">{formatMoney(Number(summary?.landed_cost_per_pc ?? 0) * a.qty)}</span>
            </div>
          ))}
          {adjustments.length === 0 && <p className="p-caption">কিছু নষ্ট হয়নি।</p>}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, children, tone }: { label: string; children: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card p-4">
      <p className="p-label">{label}</p>
      <p className={`p-num mt-2 text-xl font-extrabold ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : ''}`}>{children}</p>
    </div>
  );
}

function Line({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <p className="p-label">{label}</p>
      <p className="p-num font-semibold">{children}</p>
    </div>
  );
}

function Chip({ status }: { status: string }) {
  const cls = status === 'open' ? 'bg-good/10 text-good' : 'bg-espresso/10 text-ink-mute';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status === 'open' ? 'খোলা' : 'বন্ধ'}</span>;
}

function catToBn(c: string): string {
  return c === 'transport' ? 'পরিবহন' : c === 'packaging' ? 'প্যাকেজিং' : 'অন্যান্য';
}
function fundToBn(f: string): string {
  return f === 'own_pocket' ? 'নিজের পকেট' : 'ক্যাশ';
}
function reasonToBn(r: string): string {
  return r === 'damage' ? 'নষ্ট' : r === 'loss' ? 'হারানো' : r === 'sample' ? 'নমুনা' : 'অন্যান্য';
}
