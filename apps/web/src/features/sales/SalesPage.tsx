import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { deleteSale, fetchSales, updateSale, type SaleInput, type SaleRowV } from './api';
import SaleForm from './SaleForm';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { formatDhakaDate, formatMoney, isoAtDhaka, dhakaDate, toBnDigits } from '@patabin/shared';
import emptySales from 'assets/images/empty/empty-sales.png';

export default function SalesPage() {
  usePageTitle('বিক্রির তালিকা');
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SaleRowV | null>(null);

  const start = from ? isoAtDhaka(from) : '2000-01-01T00:00:00+06:00';
  const end = to ? isoAtDhaka(to, '23:59:59') : '2100-01-01T00:00:00+06:00';

  const { data: rows, isPending, isError, refetch } = useQuery({
    queryKey: ['sales', start, end],
    queryFn: () => fetchSales(start, end),
  });

  const del = async (id: string) => {
    setError('');
    if (!window.confirm('বিক্রিটি মুছে ফেলা হবে; স্টক ফিরবে। নিশ্চিত?')) return;
    try {
      await deleteSale(id);
      await invalidate(qc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'সমস্যা');
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="বিক্রির তালিকা"
        right={
          <Btn variant="ghost" onClick={() => { const t = dhakaDate(new Date().toISOString()); setFrom(t); setTo(t); }}>
            আজ
          </Btn>
        }
      />
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <Field label="থেকে" className="w-40">
          <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="পর্যন্ত" className="w-40">
          <input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {isPending && <TableSkeleton />}
      {isError && <Notice tone="error">ডেটা আনতে সমস্যা হয়েছে</Notice>}
      {rows?.length === 0 && <Empty img={emptySales} title="কোনো বিক্রি নেই" caption="নতুন বিক্রি যুক্ত করে শুরু করুন।" />}
      {rows && rows.length > 0 && <SalesTable rows={rows} onEdit={setEditing} onDelete={(id) => void del(id)} />}
      {editing && (
        <EditSheet
          sale={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await invalidate(qc);
            await refetch();
          }}
        />
      )}
    </div>
  );
}

async function invalidate(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all(['sales', 'packets', 'dashboard', 'balances', 'wallets'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function SalesTable({ rows, onEdit, onDelete }: { rows: SaleRowV[]; onEdit: (r: SaleRowV) => void; onDelete: (id: string) => void }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th className="p-3 font-semibold">তারিখ</th>
            <th className="p-3 font-semibold">বিবরণ</th>
            <th className="p-3 font-semibold">পরিমাণ</th>
            <th className="p-3 font-semibold">টাকা</th>
            <th className="p-3 font-semibold">ছাড়</th>
            <th className="p-3 font-semibold">প্যাকেট</th>
            <th className="p-3 font-semibold">মাধ্যম</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-hairline last:border-0">
              <td className="whitespace-nowrap p-3">{formatDhakaDate(r.sold_at)}</td>
              <td className="p-3">
                {r.customer_name || 'ক্রেতা'}
                {r.customer_phone ? ` · ${r.customer_phone}` : ''}
              </td>
              <td className="p-3">{toBnDigits(r.qty)}</td>
              <td className="p-3">{formatMoney(r.amount_received)}</td>
              <td className="p-3">{Number(r.discount) ? formatMoney(r.discount) : '-'}</td>
              <td className="p-3 text-xs">{r.packet_codes}</td>
              <td className="p-3 text-xs">{r.wallet_label}</td>
              <td className="p-3">
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => onEdit(r)}>
                    সম্পাদনা
                  </Btn>
                  <Btn variant="ghost" onClick={() => onDelete(r.id)}>
                    মুছুন
                  </Btn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditSheet({ sale, onClose, onSaved }: { sale: SaleRowV; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const { data: raw, error: rawError } = useQuery({
    queryKey: ['sale-raw', sale.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('wallet_account_id').eq('id', sale.id).single();
      if (error) throw error;
      return data as { wallet_account_id: string } | null;
    },
  });

  if (rawError || !raw) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/40 sm:items-center sm:p-6">
      <div role="dialog" aria-modal="true" className="card w-full rounded-b-3xl p-5 sm:mx-auto sm:max-w-lg sm:rounded-3xl">
        {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
        <SaleForm
          title="বিক্রি সম্পাদনা"
          submitLabel="হালনাগাদ"
          initial={{
            qty: sale.qty,
            list_unit_price: Number(sale.list_unit_price),
            amount_received: Number(sale.amount_received),
            customer_name: sale.customer_name ?? '',
            customer_phone: sale.customer_phone ?? '',
            wallet_account_id: raw.wallet_account_id,
            note: sale.note ?? '',
          }}
          onSubmit={async (payload: SaleInput) => {
            try {
              await updateSale(sale.id, payload);
              await invalidate(qc);
              onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'সমস্যা');
            }
          }}
        />
        <div className="mt-3 flex justify-end">
          <Btn variant="ghost" onClick={onClose}>
            বন্ধ
          </Btn>
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="card p-4">
      {[0, 1, 2, 3, 4].map((n) => (
        <div key={n} className="mb-2 flex gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 grow" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}
