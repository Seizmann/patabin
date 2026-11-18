import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { fetchSaleDetails, createSale, deleteSale, fetchSales, fetchWallets, fetchPacketsPreview, updateSale, type SaleInput, type SaleRowV } from './api';
import SaleForm from './SaleForm';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Empty, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { useDialog } from 'components/ui/Dialog';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import { Plus, X } from '@phosphor-icons/react';
import { formatDhakaDateTime, formatMoney, toBnDigits } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import { mapError } from 'lib/errors';
import { useWriteGuard } from 'hooks/useWriteGuard';
import { useViewMode } from 'lib/viewMode';
import emptySales from 'assets/images/empty/empty-sales.png';

const PAGE_SIZE = 20;

function useDebounced(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function SalesPage() {
  usePageTitle('বিক্রির তালিকা');
  const qc = useQueryClient();
  const dialog = useDialog();
  const { guard, denied } = useWriteGuard('sales');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<SaleRowV | null>(null);
  const [detail, setDetail] = useState<SaleRowV | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [wallet, setWallet] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [enteredBy, setEnteredBy] = useState('');
  const { myPartnerId: mine, isSelf } = useViewMode();
  const debouncedSearch = useDebounced(search);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: fetchWallets });
  const { data: stockPackets = [] } = useQuery({ queryKey: ['packets-preview'], queryFn: fetchPacketsPreview });
  const { data: admins = [] } = useQuery({
    queryKey: ['profiles-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, display_name').eq('is_active', true).order('display_name');
      if (error) throw error;
      return (data ?? []) as { id: string; display_name: string }[];
    },
  });

  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['sales', start, end, debouncedSearch, wallet, dueOnly, enteredBy, isSelf ? mine : ''],
    queryFn: ({ pageParam }) => fetchSales(start, end, pageParam, PAGE_SIZE, debouncedSearch, wallet, dueOnly, enteredBy, isSelf ? (mine ?? '') : ''),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.rows.length < PAGE_SIZE ? undefined : pages.length),
  });
  const rows = data?.pages.flatMap((p) => p.rows) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '400px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const del = async (id: string) => {
    setError('');
    const ok = await dialog.confirm({ title: 'বিক্রি মুছে ফেলবেন?', message: 'বিক্রিটি মুছে ফেলা হবে; স্টক ফিরবে। নিশ্চিত?', destructive: true, confirmText: 'মুছুন' });
    if (!ok) return;
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
        right={<PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} showAll />}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="নাম, ফোন বা নোট দিয়ে খুঁজুন"
          aria-label="বিক্রি খুঁজুন"
        />
        <select className="field min-h-[44px] w-auto py-1.5" value={wallet} onChange={(e) => setWallet(e.target.value)} aria-label="মাধ্যম">
          <option value="">সব মাধ্যম</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.name}>
              {walletDisplay(w)}
            </option>
          ))}
        </select>
        <select className="field min-h-[44px] w-auto py-1.5" value={enteredBy} onChange={(e) => setEnteredBy(e.target.value)} aria-label="এন্ট্রি অ্যাডমিন">
          <option value="">সব অ্যাডমিন</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name}
            </option>
          ))}
        </select>
        <Btn variant={dueOnly ? 'solid' : 'ghost'} className="shrink-0" onClick={() => setDueOnly((v) => !v)}>
          শুধু বাকি
        </Btn>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {isSelf && <Notice tone="info">শুধু আপনার বিক্রি দেখানো হচ্ছে (self mode)।</Notice>}
      {isPending && <TableSkeleton />}
      {isError && <Notice tone="error">ডেটা আনতে সমস্যা হয়েছে</Notice>}
      {rows.length === 0 && !isPending && (
        <Empty
          img={emptySales}
          title="কোনো বিক্রি নেই"
          caption={search || wallet || dueOnly || enteredBy ? 'ফিল্টার বদলে আবার দেখুন।' : 'নতুন বিক্রি যুক্ত করে শুরু করুন।'}
        />
      )}
      {rows.length > 0 && (
        <>
          <div>
            <SalesTable rows={rows} onEdit={guard((r: SaleRowV) => setEditing(r))} onDelete={guard((id: string) => void del(id))} onDetail={setDetail} />
          </div>
          <div ref={sentinelRef} aria-hidden />
          {isFetchingNextPage && (
            <div role="status" aria-busy className="flex justify-center py-2">
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          )}
          {!hasNextPage && rows.length >= PAGE_SIZE && (
            <p className="p-caption p-num text-center">সব দেখানো হয়েছে</p>
          )}
        </>
      )}
      {denied}
      <button
        type="button"
        aria-label="নতুন বিক্রি"
        className="fixed bottom-[calc(max(12px,env(safe-area-inset-bottom))+76px)] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-cocoa to-espresso text-white shadow-[0_10px_28px_rgba(74,44,29,0.45)] transition-transform hover:scale-105 active:scale-95 lg:bottom-8 lg:right-8"
        onClick={guard(() => {
          if (stockPackets.length === 0) {
            void dialog.alert({ title: 'স্টক নেই', message: 'চালু চালানে কোনো স্টক বাকি নেই। নতুন চালান এলে বিক্রি করা যাবে।' });
            return;
          }
          setSheetOpen(true);
        })}
      >
        <Plus weight="bold" size={24} />
      </button>
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
            <th className="p-3 font-semibold">তারিখ ও সময়</th>
            <th className="p-3 font-semibold">ক্রেতা</th>
            <th className="p-3 font-semibold">পরিমাণ</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-hairline last:border-0">
              <td className="whitespace-nowrap p-3">{formatDhakaDateTime(r.sold_at)}</td>
              <td className="p-3">
                <button type="button" className="font-semibold hover:underline" onClick={() => onDetail(r)}>
                  {r.customer_name || 'ক্রেতা'}
                  {r.customer_phone ? ` · ${r.customer_phone}` : ''}
                </button>
              </td>
              <td className="p-3">{toBnDigits(r.qty)}</td>
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
            <p className="p-title">বিক্রি — {formatDhakaDateTime(sale.sold_at)}</p>
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
              {data?.enteredBy && (
                <div className="flex justify-between py-1.5">
                  <span>এন্ট্রি করেছে</span>
                  <span className="font-semibold">{data.enteredBy}</span>
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
