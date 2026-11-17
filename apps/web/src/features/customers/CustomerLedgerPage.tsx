import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from '@phosphor-icons/react';
import { fetchCustomerLedger, fetchWallets } from './api';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Notice, Skeleton } from 'components/ui/base';
import { mapError } from 'lib/errors';
import { walletDisplay } from 'lib/wallet';
import { formatDhakaDateTime, formatMoney, toBnDigits } from '@patabin/shared';
import emptySearch from 'assets/images/empty/empty-search.png';

export default function CustomerLedgerPage() {
  const { id = '' } = useParams();
  usePageTitle('কাস্টমার খাতা');
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['customer-ledger', id],
    queryFn: () => fetchCustomerLedger(id),
    enabled: Boolean(id),
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="p-label">কাস্টমার খাতা</p>
          {data ? (
            <p className="p-display">
              {data.customer.name}
              {data.customer.phone ? <span className="p-caption ml-2">{data.customer.phone}</span> : null}
            </p>
          ) : (
            <div className="skeleton mt-2 h-8 w-40" />
          )}
        </div>
        <Link to="/customers" aria-label="কাস্টমার তালিকায় ফিরুন" className="btn grid h-11 w-11 shrink-0 place-items-center p-0">
          <ArrowLeft weight="bold" size={20} />
        </Link>
      </div>

      {isPending && <Skeleton className="h-40 w-full" />}
      {isError && <Notice tone="error">{mapError(error)}</Notice>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="card px-2 py-3">
              <p className="p-caption text-ink-mute">মোট নেওয়া</p>
              <p className="p-num text-base font-bold">{toBnDigits(data.events.reduce((s, e) => (e.kind === 'sale' ? s + e.qty : s), 0))} পিস</p>
            </div>
            <div className="card px-2 py-3">
              <p className="p-caption text-ink-mute">মোট দিয়েছে</p>
              <p className="p-num text-base font-bold">
                {formatMoney(data.events.reduce((s, e) => s + (e.kind === 'sale' ? e.received : e.amount), 0))}
              </p>
            </div>
            <div className="card px-2 py-3">
              <p className="p-caption text-ink-mute">বাকি</p>
              <p className={`p-num text-base font-bold ${data.balance > 0 ? 'text-bad' : 'text-good'}`}>{formatMoney(data.balance)}</p>
            </div>
          </div>

          {data.events.length === 0 ? (
            <Empty img={emptySearch} title="কোনো লেনদেন নেই" caption="বিক্রি বা শোধ হলে এখানে জমা হবে।" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left">
                    <th className="p-3 font-semibold">সময়</th>
                    <th className="p-3 font-semibold">বিবরণ</th>
                    <th className="p-3 text-right font-semibold">দিয়েছে</th>
                    <th className="p-3 text-right font-semibold">বাকি</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0">
                      <td className="whitespace-nowrap p-3">{formatDhakaDateTime(e.at)}</td>
                      <td className="p-3">
                        {e.kind === 'sale' ? (
                          <>
                            <span className="font-semibold">বিক্রি</span>
                            <span className="p-caption"> — {toBnDigits(e.qty)} পিস · তালিকা {formatMoney(e.listValue)}</span>
                            {e.chalanCodes.length > 0 && <p className="p-caption text-ink-mute">চালান: {e.chalanCodes.join(', ')}</p>}
                          </>
                        ) : (
                          <>
                            <span className="font-semibold text-good">জমা</span>
                            {e.note ? <span className="p-caption"> — {e.note}</span> : null}
                            <p className="p-caption text-ink-mute">{walletDisplay(wallets.find((w) => w.id === e.walletAccountId) ?? { name: '', label: '', type: '' })}</p>
                          </>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {e.kind === 'sale' ? formatMoney(e.received) : <span className="font-semibold text-good">{formatMoney(e.amount)}</span>}
                      </td>
                      <td className={`p-3 text-right ${e.kind === 'sale' && e.due > 0 ? 'font-semibold text-bad' : ''}`}>
                        {e.kind === 'sale' ? (e.due > 0 ? formatMoney(e.due) : '-') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <Link to="/customers">
              <Btn variant="ghost">কাস্টমার তালিকা</Btn>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
