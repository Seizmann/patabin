import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash } from '@phosphor-icons/react';
import { closeChalan, deleteChalan, fetchChalans, reopenChalan } from './api';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { useDialog } from 'components/ui/Dialog';
import { mapError } from 'lib/errors';
import { useWriteGuard } from 'hooks/useWriteGuard';
import { useViewMode } from 'lib/viewMode';
import { formatDhakaDate, formatMoney } from '@patabin/shared';
import emptyChalan from 'assets/images/empty/empty-expenses.png';

export default function ChalansPage() {
  usePageTitle('চালান');
  const qc = useQueryClient();
  const { guard, pop, denied, canWrite } = useWriteGuard('chalans');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const { suAdmin } = useAuth();
  const dialog = useDialog();
  const { myPartnerId: mine, isSelf } = useViewMode();
  const { data: allRows, isPending } = useQuery({ queryKey: ['chalans'], queryFn: fetchChalans });
  const { data: myChalanIds } = useQuery({
    queryKey: ['my-chalan-purchases', mine],
    queryFn: async () => {
      const { data, error } = await supabase.from('chalan_purchases').select('chalan_id').eq('partner_id', mine!).is('deleted_at', null);
      if (error) throw error;
      return new Set(((data ?? []) as { chalan_id: string }[]).map((r) => r.chalan_id));
    },
    enabled: isSelf && !!mine,
  });
  const rows = isSelf && myChalanIds ? (allRows ?? []).filter((c) => myChalanIds.has(c.id)) : allRows;
  const { data: summaries } = useQuery({
    queryKey: ['chalan-summaries'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_chalan_summary').select('*').order('code', { ascending: false });
      if (error) throw error;
      return (data ?? []) as { chalan_id: string; bought_pcs: number; remaining: number; capital: number; expenses: number }[];
    },
  });

  const act = async (id: string, close: boolean) => {
    setBusy(true);
    setError('');
    setOk('');
    try {
      await (close ? closeChalan(id) : reopenChalan(id));
      setOk(close ? 'চালান বন্ধ হয়েছে' : 'চালান খোলা হয়েছে');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['chalans'] }),
        qc.invalidateQueries({ queryKey: ['chalans-period-meta'] }),
        qc.invalidateQueries({ queryKey: ['chalan-summaries'] }),
        qc.invalidateQueries({ queryKey: ['open-chalan-guard'] }),
        qc.invalidateQueries({ queryKey: ['open-chalan-pack'] }),
      ]);
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const del = async (id: string) => {
    const okDel = await dialog.confirm({
      title: 'চালান মুছে ফেলবেন?',
      message: 'চালান ও এর প্যাকেট মুছে ফেলা হবে; বিক্রি হয়ে গেলে মোছা যাবে না। নিশ্চিত?',
      destructive: true,
      confirmText: 'মুছুন',
    });
    if (!okDel) return;
    setBusy(true);
    setError('');
    setOk('');
    try {
      await deleteChalan(id);
      setOk('চালান মুছে ফেলা হয়েছে');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['chalans'] }),
        qc.invalidateQueries({ queryKey: ['chalans-period-meta'] }),
        qc.invalidateQueries({ queryKey: ['chalan-summaries'] }),
        qc.invalidateQueries({ queryKey: ['open-chalan-guard'] }),
        qc.invalidateQueries({ queryKey: ['open-chalan-pack'] }),
        qc.invalidateQueries({ queryKey: ['packets'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['balances'] }),
        qc.invalidateQueries({ queryKey: ['partner-balances'] }),
      ]);
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="চালান"
        right={
          <Link
            to="/chalans/new"
            className="btn"
            onClick={(e) => {
              if (canWrite) return;
              e.preventDefault();
              pop();
            }}
          >
            {`+ নতুন চালান`}
          </Link>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {isSelf && <Notice tone="info">শুধু আপনার চালান দেখানো হচ্ছে (self mode)।</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}
      {denied}
      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-12 w-full" />
          ))}
        </div>
      )}
      {rows?.length === 0 && <Empty img={emptyChalan} title="কোনো চালান নেই" caption="পাইকারি কেনা শুরু করতে নতুন চালান খুলুন।" />}
      {rows && rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">কোড</th>
                <th className="p-3 font-semibold">তারিখ</th>
                <th className="p-3 font-semibold">স্ট্যাটাস</th>
                <th className="p-3 font-semibold">কেনা</th>
                <th className="p-3 font-semibold">বাকি</th>
                <th className="p-3 font-semibold">পুঁজি</th>
                <th className="p-3 font-semibold">খরচ</th>
                <th className="p-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const s = summaries?.find((x) => x.chalan_id === c.id);
                return (
                  <tr key={c.id} className="border-b border-hairline last:border-0 hover:bg-canvas/60">
                    <td className="p-3 font-semibold">
                      <Link to={`/chalans/${c.code}`} className="hover:underline">
                        {c.code}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap p-3">{formatDhakaDate(c.purchase_date)}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-0.5 ${c.status === 'open' ? 'bg-canvas text-good' : 'bg-canvas text-ink-mute'}`}>
                        {c.status === 'open' ? 'চলছে' : 'বন্ধ'}
                      </span>
                    </td>
                    <td className="p-3">{s ? `${s.bought_pcs} পিস` : '-'}</td>
                    <td className="p-3">{s ? `${s.remaining} পিস` : '-'}</td>
                    <td className="p-3">{s ? formatMoney(s.capital) : '-'}</td>
                    <td className="p-3">{s ? formatMoney(s.expenses) : '-'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {c.status === 'open' ? (
                          <Btn variant="ghost" busy={busy} onClick={guard(() => void act(c.id, true))}>
                            বন্ধ
                          </Btn>
                        ) : (
                          <Btn variant="ghost" busy={busy} onClick={guard(() => void act(c.id, false))}>
                            খুলুন
                          </Btn>
                        )}
                        {suAdmin && c.status === 'open' && (
                          <Btn variant="ghost" aria-label="মুছুন" busy={busy} onClick={guard(() => void del(c.id))}>
                            <Trash size={16} aria-hidden />
                          </Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
