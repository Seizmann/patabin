import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Field, PageTitle, Skeleton } from 'components/ui/base';
import { formatDhakaDateTime } from '@patabin/shared';

type AuditRow = { id: number; at: string; table_name: string; row_id: string | null; action: string; old_data: unknown; new_data: unknown };

const TABLE_BN: Record<string, string> = {
  profiles: 'প্রোফাইল',
  partners: 'পার্টনার',
  settings: 'সেটিংস',
  batches: 'ব্যাচ',
  batch_contributions: 'কেনা',
  expenses: 'খরচ',
  stock_adjustments: 'নষ্ট/ক্ষতি',
  sales: 'বিক্রি',
  transfers: 'হাতবদল',
  batch_close_snapshots: 'ব্যাচ বন্ধের স্ন্যাপশট',
};

const ACTION_BN: Record<string, string> = { I: 'নতুন', U: 'পরিবর্তন', D: 'মুছে ফেলা' };

export default function AuditTrailPage() {
  usePageTitle('পরিবর্তনের ইতিহাস');
  const [table, setTable] = useState('');
  const [limit, setLimit] = useState(100);

  const { data, isPending } = useQuery({
    queryKey: ['audit', table, limit],
    queryFn: async () => {
      let q = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(limit);
      if (table) q = q.eq('table_name', table);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="পরিবর্তনের ইতিহাস"
        right={
          <Btn variant="ghost" onClick={() => setLimit(limit === 100 ? 500 : 100)}>
            {limit === 100 ? 'আরও দেখুন' : 'কম দেখুন'}
          </Btn>
        }
      />
      <div className="card p-4">
        <Field label="টেবিল ফিল্টার">
          <select className="field" value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">সব</option>
            {Object.entries(TABLE_BN).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}
      {data && data.length === 0 && <p className="p-caption">কোনো পরিবর্তন নেই।</p>}
      {data && data.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="p-3 font-semibold">সময়</th>
                <th className="p-3 font-semibold">টেবিল</th>
                <th className="p-3 font-semibold">কাজ</th>
                <th className="p-3 font-semibold">বিস্তারিত</th>
              </tr>
            </thead>
            <tbody>
              {data.map((x) => (
                <tr key={x.id} className="border-b border-hairline last:border-0 align-top">
                  <td className="whitespace-nowrap p-3">{formatDhakaDateTime(x.at)}</td>
                  <td className="p-3">{TABLE_BN[x.table_name] ?? x.table_name}</td>
                  <td className="p-3">{ACTION_BN[x.action] ?? x.action}</td>
                  <td className="p-3">
                    <details className="p-caption">
                      <summary className="cursor-pointer font-semibold">দেখুন</summary>
                      <pre className="max-w-md overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                        {summarize(x.action, x.old_data, x.new_data)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function summarize(action: string, oldData: unknown, newData: unknown): string {
  if (action === 'I') return JSON.stringify(newData, null, 1);
  if (action === 'D') return JSON.stringify(oldData, null, 1);
  const o = (oldData ?? {}) as Record<string, unknown>;
  const n = (newData ?? {}) as Record<string, unknown>;
  const diff = Object.keys(n)
    .filter((k) => k !== 'updated_at' && JSON.stringify(o[k]) !== JSON.stringify(n[k]))
    .map((k) => `${k}: ${JSON.stringify(o[k])} → ${JSON.stringify(n[k])}`);
  return diff.join('\n') || JSON.stringify(n, null, 1);
}
