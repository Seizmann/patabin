import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { fetchSaleDetails, createSale, deleteSale, fetchSales, updateSale, type SaleInput, type SaleRowV } from './api';
import SaleForm from './SaleForm';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import { Plus, X } from '@phosphor-icons/react';
import { formatDhakaDate, formatMoney, toBnDigits } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import { mapError } from 'lib/errors';
import emptySales from 'assets/images/empty/empty-sales.png';

export default function SalesPage() {
  usePageTitle('বিক্রির তালিকা');
  const qc = useQueryClient();
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SaleRowV | null>(null);
  const [detail, setDetail] = useState<SaleRowV | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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
          <div className="flex items-center gap-2">
            <PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} showAll />
            <button type="button" aria-label="নতুন বিক্রি" className="btn grid h-11 w-11 place-items-center p-0" onClick={() => setSheetOpen(true)}>
              <Plus weight="bold" size={20} />
            </button>
          </div>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {isPending && <TableSkeleton />}
      {isError && <Notice tone="error">ডেটা আনতে সমস্যা হয়েছে</Notice>}
      {rows?.length === 0 && <Empty img={emptySales} title="কোনো বিক্রি নেই" caption="নতুন বিক্রি যুক্ত করে শুরু করুন।" />}
      {rows && rows.length > 0 && <SalesTable rows={rows} onEdit={setEditing} onDelete={(id) => void del(id)} onDetail={setDetail} />}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/40 sm:items-center sm:p-6">
          <div role="dialog" aria-modal="true" className="w-full max-h-[92vh] overflow-y-auto rounded-b-3xl border-0 sm:mx-auto sm:max-w-lg sm:rounded-3xl">
            <div className="flex justify-end p-2 sm:p-3">
              <button type="button" aria-label="বন্ধ করুন" className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink-mute" onClick={() => setSheetOpen(false)}>
                <X weight="bold" size={20} />
              </button>
            </div>
            <SaleForm
              title="নতুন বিক্রি"
              submitLabel="বিক্রি সংরক্ষণ"
              onSubmit={async (payload: SaleInput) => {
                await createSale(payload);
                await invalidate(qc);
                setSheetOpen(false);
              }}
            />
          </div>
        </div>
      )}
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
      {detail && <SaleDetailSheet sale={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

async function invalidate(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all(['sales', 'packets', 'packets-preview', 'dashboard', 'balances', 'wallets', 'customers'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function SalesTable({ rows, onEdit, onDelete, onDetail }: { rows: SaleRowV[]; onEdit: (r: SaleRowV) => void; onDelete: (id: string) => void; onDetail: (r: SaleRowV) => void }) {
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
                <button type="button" className="font-semibold hover:underline" onClick={() => onDetail(r)}>
                  {r.customer_name || 'ক্রেতা'}
                  {r.customer_phone ? ` · ${r.customer_phone}` : ''}
                </button>
              </td>
              <td className="p-3">{toBnDigits(r.qty)}</td>
              <td className="p-3">{formatMoney(r.amount_received)}</td>
              <td className="p-3">{Number(r.discount) ? formatMoney(r.discount) : '-'}</td>
              <td className="p-3 text-xs">{r.packet_codes}</td>
              <td className="p-3 text-xs">{r.wallet_details || (r.wallet_name ? `${r.wallet_name} ··${r.wallet_label.slice(-2)}` : r.wallet_label)}</td>
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
      const { data, error } = await supabase.from('sales').select('wallet_account_id, customer_id, due_amount, sale_allocations(packet_id, qty)').eq('id', sale.id).single();
      if (error) throw error;
      return data as { wallet_account_id: string; customer_id: string | null; due_amount: number; sale_allocations: { packet_id: string; qty: number }[] | null } | null;
    },
  });

  if (rawError || !raw) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/40 sm:items-center sm:p-6">
      <div role="dialog" aria-modal="true" className="w-full max-h-[92vh] overflow-y-auto rounded-b-3xl p-5 sm:mx-auto sm:max-w-lg sm:rounded-3xl">
        {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
        <SaleForm
          title="বিক্রি সম্পাদনা"
          submitLabel="হালনাগাদ"
          initial={{
            qty: sale.qty,
            list_unit_price: Number(sale.list_unit_price),
            amount_received: Number(sale.amount_received),
            wallet_account_id: raw.wallet_account_id,
            note: sale.note ?? '',
            due_amount: Number(raw.due_amount ?? 0),
            customerId: raw.customer_id ?? undefined,
            allocations: raw.sale_allocations ?? undefined,
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

function SaleDetailSheet({ sale, onClose }: { sale: SaleRowV; onClose: () => void }) {
  const { data, isPending, error } = useQuery({ queryKey: ['sale-detail', sale.id], queryFn: () => fetchSaleDetails(sale.id) });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const listValue = Number(sale.qty) * Number(sale.list_unit_price);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="card relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 lg:rounded-b-[24px]" role="dialog" aria-modal="true" aria-label="বিক্রির বিস্তারিত">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="p-title">বিক্রি — {formatDhakaDate(sale.sold_at)}</p>
            <p className="p-caption">
              {sale.customer_name || 'ক্রেতা'}
              {sale.customer_phone ? ` · ${sale.customer_phone}` : ''}
            </p>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            বন্ধ
          </Btn>
        </div>
        {isPending ? <Skeleton className="mt-4 h-40 w-full" /> : error ? <Notice tone="error">{mapError(error)}</Notice> : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-canvas px-2 py-3">
                <p className="p-caption text-ink-mute">পরিমাণ</p>
                <p className="text-base font-bold">{toBnDigits(sale.qty)} পিস</p>
              </div>
              <div className="rounded-xl bg-canvas px-2 py-3">
                <p className="p-caption text-ink-mute">তালিকা মূল্য</p>
                <p className="text-base font-bold">{formatMoney(listValue)}</p>
              </div>
              <div className="rounded-xl bg-canvas px-2 py-3">
                <p className="p-caption text-ink-mute">দেওয়া</p>
                <p className="text-base font-bold">{formatMoney(sale.amount_received)}</p>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-hairline text-sm">
              <div className="flex justify-between py-1.5">
                <span>তালিকা মূল্য (প্রতি পিস)</span>
                <span>{formatMoney(sale.list_unit_price)}</span>
              </div>
              {Number(sale.discount) > 0 && (
                <div className="flex justify-between py-1.5">
                  <span>ছাড়</span>
                  <span className="text-bad">
                    {formatMoney(sale.discount)} {sale.discount_pct ? `(${toBnDigits(Math.round(Number(sale.discount_pct)))}%)` : ''}
                  </span>
                </div>
              )}
              {Number(sale.due_amount) > 0 && (
                <div className="flex justify-between py-1.5">
                  <span>বাকি</span>
                  <span className="font-semibold text-bad">{formatMoney(sale.due_amount)}</span>
                </div>
              )}
            </div>

            <div>
              <p className="p-label">প্যাকেট কাটা</p>
              {(data?.packets ?? []).length === 0 ? (
                <p className="p-caption mt-2 text-ink-mute">তথ্য নেই।</p>
              ) : (
                <div className="mt-2 flex flex-col divide-y divide-hairline">
                  {(data?.packets ?? []).map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <b>{p.label}</b> · {p.owner_name}
                      </span>
                      <span>{toBnDigits(p.qty)} পিস</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="p-label">টাকা কোথায় গেল</p>
              {(data?.receives ?? []).length === 0 ? (
                <div className="mt-2 flex justify-between py-2 text-sm">
                  <span>{walletDisplay({ type: sale.wallet_type, name: sale.wallet_name, label: sale.wallet_label })}</span>
                  <span>{formatMoney(sale.amount_received)}</span>
                </div>
              ) : (
                <div className="mt-2 flex flex-col divide-y divide-hairline">
                  {(data?.receives ?? []).map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span>{walletDisplay({ type: r.type, label: r.label })}</span>
                      <span>{formatMoney(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {sale.note && (
              <div>
                <p className="p-label">নোট</p>
                <p className="p-caption mt-1">{sale.note}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
