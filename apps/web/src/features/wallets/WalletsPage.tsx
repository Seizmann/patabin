import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { useAuth } from 'lib/auth';
import { Btn, Card, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { fetchPartners, myPartnerId } from 'lib/api';
import { usePeriodFilter } from 'components/PeriodFilter';
import { mapError } from 'lib/errors';
import { formatDhakaDateTime, formatMoney } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import offlineImg from 'assets/images/empty/offline.png';

type WalletBalance = { wallet_id: string; type: string; name: string; label: string; is_active: boolean; amount: string | number };

export default function WalletsPage() {
  usePageTitle('ওয়ালেট');
  const { suAdmin, readOnly } = useAuth();
  const { start, end } = usePeriodFilter('chalan');
  const { data: wallets = [], isPending } = useQuery({
    queryKey: ['wallets-all', start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('wallet_flows', { p_start: start, p_end: end });
      if (error) throw error;
      return (data ?? []) as WalletBalance[];
    },
  });
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: myId } = useQuery({ queryKey: ['my-partner'], queryFn: myPartnerId });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="ওয়ালেট" />
      {isPending && <Skeleton className="h-24 w-full" />}
      {wallets.length === 0 && !isPending && <Empty img={offlineImg} title="ওয়ালেট নেই" caption="ক্যাশ ওয়ালেট যোগ করুন।" />}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {wallets.map((w) => (
          <Card key={w.wallet_id} className="p-5">
            <p className="p-label">{walletDisplay(w)}</p>
            <p className="p-display">{formatMoney(w.amount)}</p>
            <p className="p-caption mt-1">চলতি চালানের হিসাব</p>
          </Card>
        ))}
      </div>

      <AccountsCard wallets={wallets.map((w) => ({ id: w.wallet_id, type: w.type, name: w.name, label: w.label, is_active: w.is_active }))} suAdmin={suAdmin} readOnly={readOnly} />
      <TransferCard wallets={wallets} partners={partners} myId={myId ?? null} readOnly={readOnly} />
      <WithdrawCard wallets={wallets} partners={partners} myId={myId ?? null} readOnly={readOnly} />

      <MfsNote partners={partners} myId={myId ?? null} />
    </div>
  );
}

function TransferCard({ wallets, partners, readOnly }: { wallets: WalletBalance[]; partners: { id: string; name: string }[]; myId: string | null; readOnly: boolean }) {
  const qc = useQueryClient();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [charge, setCharge] = useState('0');
  const [attributedTo, setAttributedTo] = useState('');
  const [at, setAt] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const from = wallets.find((w) => w.wallet_id === fromId);
  const to = wallets.find((w) => w.wallet_id === toId);
  const cashLocked = from?.type === 'cash';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!from || !to || from.wallet_id === to.wallet_id || !Number(amount)) {
      setError('দুইটি আলাদা ওয়ালেট ও টাকার পরিমাণ দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_transfer', {
        p_t: {
          from_wallet_id: fromId,
          to_wallet_id: toId,
          amount: Number(amount),
          charge: cashLocked ? 0 : Number(charge || 0),
          attributed_to_partner_id: attributedTo || undefined,
          note: note || null,
          at: at ?? null,
        },
      });
      if (rpcErr) throw rpcErr;
      await qc.invalidateQueries({ queryKey: ['wallets-all'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOk('স্থানান্তর সংরক্ষিত');
      setAmount('');
      setNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <Card className="p-6">
      <p className="p-label mb-4">স্থানান্তর</p>
      {!readOnly && (
        <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <Field label="কোথা থেকে">
          <select className="field" value={fromId} onChange={(e) => setFromId(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {wallets.map((w) => (
              <option key={w.wallet_id} value={w.wallet_id}>
                {walletDisplay(w)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="কোথায়">
          <select className="field" value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {wallets.map((w) => (
              <option key={w.wallet_id} value={w.wallet_id}>
                {walletDisplay(w)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="টাকা (৳)">
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        {from?.type !== 'cash' && to?.type === 'cash' ? (
          <Field label="ক্যাশআউট চার্জ (৳)">
            <NumberInput value={charge} onChange={setCharge} placeholder="0" />
          </Field>
        ) : (
          <div className="p-caption self-end rounded-xl bg-canvas px-3 py-2">{cashLocked ? 'ক্যাশ থেকে এমএফএসে চার্জ নেই' : '—'}</div>
        )}
        <Field label="কার জন্য (চার্জের দায়)">
          <select className="field" value={attributedTo} onChange={(e) => setAttributedTo(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="সময়">
          <TimeInput value={at} onChange={setAt} />
        </Field>
        <Field label="নোট (ঐচ্ছিক)" className="col-span-2">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Btn type="submit" busy={busy}>
            স্থানান্তর করুন
          </Btn>
          {ok && <Notice tone="ok">{ok}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        </form>
      )}
      <TransfersTable />
    </Card>
  );
}

function TransfersTable() {
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: rows } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wallet_transfers').select('*').is('deleted_at', null).order('at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; at: string; from_wallet_id: string; to_wallet_id: string; amount: number; charge: number; attributed_to_partner_id: string }[];
    },
  });
  const { data: walletsAll = [] } = useQuery({
    queryKey: ['wallets-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wallets').select('id, type, name, label');
      if (error) throw error;
      return (data ?? []) as { id: string; type: string; name: string; label: string }[];
    },
  });
  const walletName = (id: string) => {
    const w = walletsAll.find((x) => x.id === id);
    return w ? walletDisplay(w) : id;
  };
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? '';

  if (!rows?.length) return null;
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th className="p-2 font-semibold">সময়</th>
            <th className="p-2 font-semibold">হস্তান্তর</th>
            <th className="p-2 font-semibold">টাকা</th>
            <th className="p-2 font-semibold">চার্জ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-hairline last:border-0">
              <td className="whitespace-nowrap p-2">{formatDhakaDateTime(t.at)}</td>
              <td className="p-2">{walletName(t.from_wallet_id)} → {walletName(t.to_wallet_id)}</td>
              <td className="p-2">{formatMoney(t.amount)}</td>
              <td className="p-2">{Number(t.charge) ? `${formatMoney(t.charge)} (${partnerName(t.attributed_to_partner_id)})` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawCard({ wallets, partners, myId, readOnly }: { wallets: WalletBalance[]; partners: { id: string; name: string }[]; myId: string | null; readOnly: boolean }) {
  const qc = useQueryClient();
  const [wallet, setWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [detail, setDetail] = useState<WithdrawalRow | null>(null);

  const { data: openChalans = [] } = useQuery({
    queryKey: ['open-chalan-guard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chalans').select('id').eq('status', 'open').is('deleted_at', null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const hasOpenChalan = openChalans.length > 0;

  const { data: partnerBalances = [] } = useQuery({
    queryKey: ['partner-balances'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_partner_balance').select('partner_id, balance');
      if (error) throw error;
      return (data ?? []) as { partner_id: string; balance: string | number }[];
    },
  });

  const effectivePartner = partnerId || myId;
  const partnerBalance = Number(partnerBalances.find((b) => b.partner_id === effectivePartner)?.balance ?? 0);
  const amountNum = Number(amount);
  const exceeds = !!effectivePartner && !!amountNum && amountNum > partnerBalance;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (hasOpenChalan) {
      setError('চালান এখনো খোলা আছে; চালান বন্ধ হলে টাকা তোলা যাবে।');
      return;
    }
    if (!wallet || !Number(amount) || !effectivePartner) {
      setError('ওয়ালেট ও পরিমাণ দিন।');
      return;
    }
    if (Number(amount) > partnerBalance) {
      setError('ব্যালেন্সের চেয়ে বেশি টাকা তোলা যাবে না।');
      return;
    }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_withdrawal', {
        p_w: { partner_id: effectivePartner, wallet_account_id: wallet, amount: Number(amount), note: note || null, at: at ?? null },
      });
      if (rpcErr) throw rpcErr;
      await qc.invalidateQueries({ queryKey: ['wallets-all'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
      await qc.invalidateQueries({ queryKey: ['partner-balances'] });
      await qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setOk('উত্তোলন সংরক্ষিত');
      setAmount('');
      setNote('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <Card className="p-6">
      <p className="p-label mb-4">নিজের টাকা তুলুন</p>
      {!readOnly && (
        <>
        {hasOpenChalan && <Notice tone="error">চালান খোলা আছে; চালান বন্ধ হলে টাকা তোলা যাবে।</Notice>}
        <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <Field label="শূন্য ধরার পার্টনার">
          <select className="field" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">নিজে</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ওয়ালেট">
          <select className="field" value={wallet} onChange={(e) => setWallet(e.target.value)}>
            <option value="">-- নির্বাচন করুন --</option>
            {wallets.map((w) => (
              <option key={w.wallet_id} value={w.wallet_id}>
                {walletDisplay(w)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="টাকা (৳)">
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="সময়">
          <TimeInput value={at} onChange={setAt} />
        </Field>
        <Field label="নোট (ঐচ্ছিক)" className="col-span-2">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-center gap-3">
          <Btn type="submit" busy={busy} disabled={hasOpenChalan || exceeds}>
            উত্তোলন করুন
          </Btn>
          {ok && <Notice tone="ok">{ok}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        </form>
        </>
      )}
      {effectivePartner && !hasOpenChalan && (
        <p className={`p-caption mt-3 ${exceeds ? 'text-bad' : 'text-ink-mute'}`}>
          {effectivePartner && partners.find((p) => p.id === effectivePartner)?.name ? `${partners.find((p) => p.id === effectivePartner)?.name} — ` : 'আপনার — '}ব্যালেন্স: {formatMoney(partnerBalance)}
          {exceeds ? ' (তোলার চেয়ে বেশি টাকা নেই)' : ''}
        </p>
      )}
      <WithdrawalsTable onOpen={setDetail} />
      {detail && <WithdrawalDetailSheet w={detail} partners={partners} onClose={() => setDetail(null)} />}
    </Card>
  );
}

type WithdrawalRow = { id: string; at: string; partner_id: string; wallet_account_id: string; amount: number; note: string | null; created_by: string | null };

function WithdrawalsTable({ onOpen }: { onOpen: (w: WithdrawalRow) => void }) {
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: fetchPartners });
  const { data: rows } = useQuery({
    queryKey: ['withdrawals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('withdrawals').select('*').is('deleted_at', null).order('at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WithdrawalRow[];
    },
  });
  const { data: walletsAll = [] } = useQuery({
    queryKey: ['wallets-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wallets').select('id, type, name, label');
      if (error) throw error;
      return (data ?? []) as { id: string; type: string; name: string; label: string }[];
    },
  });
  const walletName = (id: string) => {
    const w = walletsAll.find((x) => x.id === id);
    return w ? walletDisplay(w) : id;
  };
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? '';

  if (!rows?.length) return null;
  return (
    <div className="mt-6">
      <p className="p-label mb-2">পেআউট / উত্তোলনের হিসাব</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="p-2 font-semibold">সময়</th>
              <th className="p-2 font-semibold">পার্টনার</th>
              <th className="p-2 font-semibold">ওয়ালেট</th>
              <th className="p-2 font-semibold text-right">টাকা</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id} className="cursor-pointer border-b border-hairline last:border-0 hover:bg-canvas" onClick={() => onOpen(w)}>
                <td className="whitespace-nowrap p-2">{formatDhakaDateTime(w.at)}</td>
                <td className="p-2">{partnerName(w.partner_id)}</td>
                <td className="p-2">{walletName(w.wallet_account_id)}</td>
                <td className="p-2 text-right font-semibold">{formatMoney(w.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WithdrawalDetailSheet({ w, partners, onClose }: { w: WithdrawalRow; partners: { id: string; name: string }[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const partnerName = partners.find((p) => p.id === w.partner_id)?.name ?? '—';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="card relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 lg:rounded-b-[24px]" role="dialog" aria-modal="true" aria-label="উত্তোলনের বিস্তারিত">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="p-title">উত্তোলনের বিস্তারিত</p>
            <p className="p-caption">{formatDhakaDateTime(w.at)}</p>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            বন্ধ
          </Btn>
        </div>
        <div className="mt-4 flex flex-col divide-y divide-hairline text-sm">
          <div className="flex items-center justify-between py-2">
            <span className="text-ink-mute">পার্টনার</span>
            <span className="font-semibold">{partnerName}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-ink-mute">টাকা</span>
            <span className="font-semibold">{formatMoney(w.amount)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-ink-mute">সময়</span>
            <span>{formatDhakaDateTime(w.at)}</span>
          </div>
          <div className="flex items-start justify-between gap-4 py-2">
            <span className="text-ink-mute">নোট</span>
            <span className="text-right">{w.note || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsCard({ wallets, suAdmin, readOnly }: { wallets: { id: string; type: string; name: string; label: string; is_active: boolean }[]; suAdmin: boolean; readOnly: boolean }) {
  const qc = useQueryClient();
  const [type, setType] = useState('bkash');
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mfs = wallets.filter((w) => w.type !== 'cash');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!label || !name) {
      setError('নাম ও নাম্বার দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: insErr } = await supabase.from('wallets').insert({ type, name, label });
      if (insErr) throw insErr;
      await qc.invalidateQueries({ queryKey: ['wallets-all'] });
      setName('');
      setLabel('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const deactivate = async (id: string) => {
    try {
      await supabase.from('wallets').update({ is_active: false }).eq('id', id);
      await qc.invalidateQueries({ queryKey: ['wallets-all'] });
    } catch (err) {
      setError(mapError(err));
    }
  };

  return (
    <Card className="p-6">
      <p className="p-label mb-4">bKash / Nagad অ্যাকাউন্ট</p>
      <div className="flex flex-col divide-y divide-hairline">
        {mfs.map((w) => (
          <div key={w.id} className="flex items-center justify-between py-2">
            <span>{walletDisplay(w)}{w.is_active ? '' : ' (নিষ্ক্রিয়)'}</span>
            {w.is_active && !readOnly && (
              <Btn variant="ghost" onClick={() => void deactivate(w.id)}>
                নিষ্ক্রিয় করুন
              </Btn>
            )}
          </div>
        ))}
        {mfs.length === 0 && <p className="p-caption py-2 text-ink-mute">এখনো কোনো এমএফএস অ্যাকাউন্ট নেই।</p>}
      </div>
      {!readOnly && (
        <form onSubmit={add} noValidate className="mt-4 grid grid-cols-2 gap-4">
        <Field label="ধরন">
          <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="bkash">বিকাশ</option>
            <option value="nagad">নগদ</option>
          </select>
        </Field>
        <Field label="নাম">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bappy" />
        </Field>
        <Field label="বিকাশ/নগদ নাম্বার">
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="01XXXXXXXXX" />
        </Field>
        <div className="col-span-2 max-w-xs">
          <Btn type="submit" busy={busy} disabled={!suAdmin}>
            যোগ করুন
          </Btn>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        </form>
      )}
    </Card>
  );
}

function MfsNote({ partners, myId }: { partners: { id: string; name: string }[]; myId: string | null }) {
  const name = partners.find((p) => p.id === myId)?.name ?? '';
  return <p className="p-caption text-ink-mute">ক্যাশ ও ওয়ালেট সবার মিলিত; নিজের হিসাব আলাদা লেখা থাকে{name ? ` (${name})` : ''}।</p>;
}
