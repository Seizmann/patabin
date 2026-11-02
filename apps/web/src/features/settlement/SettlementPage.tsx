import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { PeriodSelect, usePeriodFilter } from 'components/PeriodFilter';
import { mapError } from 'lib/errors';
import { formatDhakaDate, formatMoney } from '@patabin/shared';

type SettlementRow = {
  chalan_id: string;
  partner_id: string;
  partner_name: string;
  capital: number;
  ext_rev: number;
  internal_rev: number;
  cost: number;
  profit: number;
  consumption_due: number;
  expenses_attributed: number;
  pocket_paid: number;
  entitlement: number;
};
type ChalanRow = { id: string; code: string; status: string; purchase_date: string };

export default function SettlementPage() {
  usePageTitle('হিসাব মেটানো');
  const { period, setPeriod, start, end, customFrom, customTo, setCustomFrom, setCustomTo } = usePeriodFilter('chalan');
  const { data: chalans = [] } = useQuery({
    queryKey: ['chalan-settlement-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chalans').select('id, code, status, purchase_date').is('deleted_at', null).order('code', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChalanRow[];
    },
  });
  const visibleChalans = chalans.filter((c) => c.purchase_date >= start && c.purchase_date < end);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle
        tag="PataBin"
        title="হিসাব মেটানো"
        right={
          <PeriodSelect period={period} setPeriod={setPeriod} customFrom={customFrom} customTo={customTo} setCustomFrom={setCustomFrom} setCustomTo={setCustomTo} showAll />
        }
      />
      <Notice tone="info">নিচের হিসাব প্রতি চালানের ভাবে, চালান খোলা অবস্থায় জীবন্ত হিসাব — বন্ধ হলে তখনকার স্ন্যাপশট।</Notice>
      {visibleChalans.length === 0 && <p className="p-caption text-ink-mute">এই সময়ে কোনো চালান নেই।</p>}
      {visibleChalans.map((c) => (
        <ChalanSettlement key={c.id} chalan={c} />
      ))}
    </div>
  );
}

function ChalanSettlement({ chalan }: { chalan: ChalanRow }) {
  const [selected, setSelected] = useState<SettlementRow | null>(null);
  const { data: rows, isPending } = useQuery({
    queryKey: ['settlement', chalan.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_partner_chalan_settlement').select('*').eq('chalan_id', chalan.id);
      if (error) throw error;
      return (data ?? []) as SettlementRow[];
    },
    enabled: true,
  });

  return (
    <div className="card overflow-x-auto">
      <p className="p-label p-4 pb-0">
        চালান {chalan.code} · {chalan.status === 'open' ? 'চলছে' : 'বন্ধ'}
      </p>
      {isPending ? (
        <div className="p-4">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (rows ?? []).length === 0 ? (
        <p className="p-caption p-4 text-ink-mute">কেনা বা প্যাকেট নেই।</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="p-3 font-semibold">পার্টনার</th>
              <th className="p-3 font-semibold">পুঁজি</th>
              <th className="p-3 font-semibold">বিক্রির টাকা</th>
              <th className="p-3 font-semibold">কস্ট</th>
              <th className="p-3 font-semibold">লাভ</th>
              <th className="p-3 font-semibold">নিজের খরচ</th>
              <th className="p-3 font-semibold">প্রাপ্য</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((s) => (
              <tr
                key={s.chalan_id + s.partner_id}
                className="cursor-pointer border-b border-hairline transition-colors last:border-0 hover:bg-canvas"
                onClick={() => setSelected(s)}
              >
                <td className="p-3 font-medium">{s.partner_name}</td>
                <td className="p-3">{formatMoney(s.capital)}</td>
                <td className="p-3">{formatMoney(Number(s.ext_rev) + Number(s.internal_rev))}</td>
                <td className="p-3">{formatMoney(s.cost)}</td>
                <td className="p-3">{formatMoney(s.profit)}</td>
                <td className="p-3">{formatMoney(Number(s.expenses_attributed) - Number(s.pocket_paid) + Number(s.consumption_due))}</td>
                <td className="p-3 font-semibold">{formatMoney(s.entitlement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selected && <PartnerHisabSheet chalan={chalan} row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

type ExpenseItem = {
  amount: number;
  note: string | null;
  spent_at: string;
  expense_categories: { name: string }[];
  paid_by?: { name: string }[];
};
type UseItem = {
  qty: number;
  at: string;
  note: string | null;
  unit_value: number;
  packets: { code: string }[];
};
type PartnerDetails = { attrs: ExpenseItem[]; uses: UseItem[]; pockets: ExpenseItem[] };

function PartnerHisabSheet({ chalan, row, onClose }: { chalan: ChalanRow; row: SettlementRow; onClose: () => void }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['partner-hisab-details', chalan.id, row.partner_id],
    queryFn: async (): Promise<PartnerDetails> => {
      const attrs = await supabase
        .from('expenses')
        .select('amount, note, spent_at, expense_categories(name), paid_by:partners!expenses_paid_by_partner_id_fkey(name)')
        .eq('chalan_id', chalan.id)
        .eq('attributed_to_partner_id', row.partner_id)
        .is('deleted_at', null)
        .order('spent_at');
      const uses = await supabase
        .from('personal_uses')
        .select('qty, at, note, unit_value, packets(code)')
        .eq('chalan_id', chalan.id)
        .eq('eater_partner_id', row.partner_id)
        .is('deleted_at', null)
        .order('at');
      const pockets = await supabase
        .from('expenses')
        .select('amount, note, spent_at, expense_categories(name)')
        .eq('chalan_id', chalan.id)
        .eq('paid_by_partner_id', row.partner_id)
        .is('wallet_account_id', null)
        .is('deleted_at', null)
        .order('spent_at');
      if (attrs.error) throw attrs.error;
      if (uses.error) throw uses.error;
      if (pockets.error) throw pockets.error;
      return { attrs: (attrs.data ?? []) as ExpenseItem[], uses: (uses.data ?? []) as UseItem[], pockets: (pockets.data ?? []) as ExpenseItem[] };
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ownExpense = Number(row.expenses_attributed) - Number(row.pocket_paid) + Number(row.consumption_due);
  const rowsList: { label: string; value: number; sign: '+' | '-' }[] = [
    { label: 'পুঁজি (কেনায় দিয়েছে)', value: Number(row.capital), sign: '+' },
    { label: 'বাইরের বিক্রির টাকা', value: Number(row.ext_rev), sign: '+' },
    { label: 'ওনার ব্যবহারের আয়', value: Number(row.internal_rev), sign: '+' },
    { label: 'কস্ট (কেনার দাম × পিস)', value: Number(row.cost), sign: '-' },
    { label: 'নিজের ব্যবহার', value: Number(row.consumption_due), sign: '-' },
    { label: 'খরচের ভাগ', value: Number(row.expenses_attributed), sign: '-' },
    { label: 'পকেট থেকে দিয়েছে', value: Number(row.pocket_paid), sign: '+' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="card relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 lg:rounded-b-[24px]" role="dialog" aria-modal="true" aria-label={`${row.partner_name} হিসাব`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="p-title">{row.partner_name}</p>
            <p className="p-caption">
              চালান {chalan.code} · {chalan.status === 'open' ? 'চলছে' : 'বন্ধ'}
            </p>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            বন্ধ
          </Btn>
        </div>

        {isPending ? (
          <Skeleton className="mt-4 h-40 w-full" />
        ) : error ? (
          <Notice tone="error">{mapError(error)}</Notice>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-canvas px-2 py-3">
                <p className="p-caption text-ink-mute">প্রাপ্য</p>
                <p className={`text-base font-bold ${Number(row.entitlement) >= 0 ? 'text-good' : 'text-bad'}`}>{formatMoney(row.entitlement)}</p>
              </div>
              <div className="rounded-xl bg-canvas px-2 py-3">
                <p className="p-caption text-ink-mute">লাভ</p>
                <p className="text-base font-bold">{formatMoney(row.profit)}</p>
              </div>
              <div className="rounded-xl bg-canvas px-2 py-3">
                <p className="p-caption text-ink-mute">নিজের খরচ</p>
                <p className="text-base font-bold">{formatMoney(ownExpense)}</p>
              </div>
            </div>

            <div>
              <p className="p-label">হিসাব ব্রেকডাউন</p>
              <div className="mt-2 flex flex-col divide-y divide-hairline">
                {rowsList.map((l) => (
                  <div key={l.label} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-ink-mute">{l.label}</span>
                    <span>
                      {l.sign}
                      {formatMoney(l.value)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 text-sm font-bold">
                  <span>প্রাপ্য</span>
                  <span className={Number(row.entitlement) >= 0 ? 'text-good' : 'text-bad'}>{formatMoney(row.entitlement)}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="p-label">খরচের তালিকা</p>
              {(data?.attrs ?? []).length === 0 ? (
                <p className="p-caption mt-2 text-ink-mute">কোনো খরচ ভাগ হয়নি।</p>
              ) : (
                <div className="mt-2 flex flex-col divide-y divide-hairline">
                  {(data?.attrs ?? []).map((x, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <b>{x.expense_categories?.[0]?.name ?? 'খরচ'}</b> · {formatDhakaDate(x.spent_at)}
                        {x.paid_by?.[0]?.name && <span className="p-caption block text-ink-mute">দিয়েছে {x.paid_by[0].name}{x.note ? ` · ${x.note}` : ''}</span>}
                      </span>
                      <span>-{formatMoney(x.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="p-label">পকেট থেকে দিয়েছে</p>
              {(data?.pockets ?? []).length === 0 ? (
                <p className="p-caption mt-2 text-ink-mute">পকেট থেকে কিছু দেননি।</p>
              ) : (
                <div className="mt-2 flex flex-col divide-y divide-hairline">
                  {(data?.pockets ?? []).map((x, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <b>{x.expense_categories?.[0]?.name ?? 'খরচ'}</b> · {formatDhakaDate(x.spent_at)}
                        {x.note && <span className="p-caption block text-ink-mute">{x.note}</span>}
                      </span>
                      <span>+{formatMoney(x.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="p-label">নিজের ব্যবহার</p>
              {(data?.uses ?? []).length === 0 ? (
                <p className="p-caption mt-2 text-ink-mute">কিছু খায়নি।</p>
              ) : (
                <div className="mt-2 flex flex-col divide-y divide-hairline">
                  {(data?.uses ?? []).map((x, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {x.packets?.[0]?.code ? `${x.packets[0].code} · ` : ''}
                        {x.qty} পিস · {formatDhakaDate(x.at)}
                        {x.note && <span className="p-caption block text-ink-mute">{x.note}</span>}
                      </span>
                      <span>-{formatMoney(Number(x.qty) * Number(x.unit_value))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
