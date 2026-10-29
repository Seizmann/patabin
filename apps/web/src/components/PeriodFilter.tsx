import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { dhakaDate, periodRange } from '@patabin/shared';

export type PeriodId = 'chalan' | 'prevChalan' | 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'chalan', label: 'এই চালান' },
  { id: 'prevChalan', label: 'গত চালান' },
  { id: 'today', label: 'আজ' },
  { id: 'yesterday', label: 'গতকাল' },
  { id: 'week', label: 'এই সপ্তাহ' },
  { id: 'month', label: 'এই মাস' },
  { id: 'lastMonth', label: 'গত মাস' },
];

type ChalanMeta = { code: string; purchase_date: string; status: string; closed_at: string | null };

export function usePeriodFilter(initial: PeriodId = 'chalan') {
  const [period, setPeriod] = useState<PeriodId>(initial);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: chalans = [] } = useQuery({
    queryKey: ['chalans-period-meta'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chalans')
        .select('code, purchase_date, status, closed_at')
        .is('deleted_at', null)
        .order('purchase_date', { ascending: false })
        .order('code', { ascending: false })
        .limit(2);
      if (error) throw error;
      return (data ?? []) as ChalanMeta[];
    },
    staleTime: 30_000,
  });
  const openChalan = chalans.find((c) => c.status === 'open');

  const [start, end] = useMemo(() => {
    const nowIso = new Date().toISOString();
    if (period === 'chalan') {
      return openChalan?.purchase_date ? [openChalan.purchase_date, nowIso] : periodRange('today', nowIso);
    }
    if (period === 'prevChalan') {
      const newest = chalans[0];
      if (!newest) return periodRange('today', nowIso);
      if (openChalan) {
        const idx = chalans.findIndex((c) => c.code === openChalan.code);
        const prev = chalans[idx + 1];
        return prev?.purchase_date ? [prev.purchase_date, openChalan.purchase_date] : periodRange('today', nowIso);
      }
      return newest.closed_at ? [newest.purchase_date, newest.closed_at] : [newest.purchase_date, nowIso];
    }
    if (period === 'all') return periodRange('all', nowIso);
    if (period === 'custom') {
      const now = new Date().toISOString();
      const endIso = customTo ? `${customTo}T23:59:59+06:00` : now;
      return [customFrom ? `${customFrom}T00:00:00+06:00` : `${dhakaDate(now)}T00:00:00+06:00`, endIso];
    }
    return periodRange(period, nowIso);
  }, [period, customFrom, customTo, chalans, openChalan]);

  return { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo };
}

export function PeriodSelect({ period, setPeriod, customFrom, customTo, setCustomFrom, setCustomTo, showAll = false }: {
  period: PeriodId;
  setPeriod: (p: PeriodId) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  showAll?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <select aria-label="সময়কাল" className="field min-h-[44px] w-auto py-1.5" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
        {showAll && <option value="all">সব</option>}
        {PERIODS.map((p) => (
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
