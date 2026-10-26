import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { useAuth } from 'lib/auth';
import { Btn, Card, Empty, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { fetchPartners, myPartnerId } from 'lib/api';
import { mapError } from 'lib/errors';
import { formatDhakaDate, formatMoney } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';
import offlineImg from 'assets/images/empty/offline.png';

type WalletBalance = { wallet_id: string; type: string; name: string; label: string; is_active: boolean; balance: string | number };

export default function WalletsPage() {
  usePageTitle('ওয়ালেট');
  const { suAdmin } = useAuth();
  const { data: wallets = [], isPending } = useQuery({
    queryKey: ['wallets-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_wallet_balance').select('*');
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
            <p className="p-display">{formatMoney(w.balance)}</p>
          </Card>
        ))}
      </div>

      <AccountsCard wallets={wallets.map((w) => ({ id: w.wallet_id, type: w.type, name: w.name, label: w.label, is_active: w.is_active }))} suAdmin={suAdmin} />
      <TransferCard wallets={wallets} partners={partners} myId={myId ?? null} />
      <WithdrawCard wallets={wallets} partners={partners} myId={myId ?? null} />

      <MfsNote partners={partners} myId={myId ?? null} />
    </div>
  );
}

function TransferCard({ wallets, partners }: { wallets: WalletBalance[]; partners: { id: string; name: string }[]; myId: string | null }) {
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
              <td className="whitespace-nowrap p-2">{formatDhakaDate(t.at)}</td>
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

function WithdrawCard({ wallets, partners, myId }: { wallets: WalletBalance[]; partners: { id: string; name: string }[]; myId: string | null }) {
  const qc = useQueryClient();
  const [wallet, setWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [note, setNote] = useState('');
  const [at, setAt] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!wallet || !Number(amount) || !(partnerId || myId)) {
      setError('ওয়ালেট ও পরিমাণ দিন।');
      return;
    }
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('create_withdrawal', {
        p_w: { partner_id: partnerId || myId, wallet_account_id: wallet, amount: Number(amount), note: note || null, at: at ?? null },
      });
      if (rpcErr) throw rpcErr;
      await qc.invalidateQueries({ queryKey: ['wallets-all'] });
      await qc.invalidateQueries({ queryKey: ['balances'] });
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
          <Btn type="submit" busy={busy}>
            উত্তোলন করুন
          </Btn>
          {ok && <Notice tone="ok">{ok}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </form>
    </Card>
  );
}

function AccountsCard({ wallets, suAdmin }: { wallets: { id: string; type: string; name: string; label: string; is_active: boolean }[]; suAdmin: boolean }) {
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
            {w.is_active && (
              <Btn variant="ghost" onClick={() => void deactivate(w.id)}>
                নিষ্ক্রিয় করুন
              </Btn>
            )}
          </div>
        ))}
        {mfs.length === 0 && <p className="p-caption py-2 text-ink-mute">এখনো কোনো এমএফএস অ্যাকাউন্ট নেই।</p>}
      </div>
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
    </Card>
  );
}

function MfsNote({ partners, myId }: { partners: { id: string; name: string }[]; myId: string | null }) {
  const name = partners.find((p) => p.id === myId)?.name ?? '';
  return <p className="p-caption text-ink-mute">ক্যাশ ও ওয়ালেট সবার মিলিত; নিজের হিসাব আলাদা লেখা থাকে{name ? ` (${name})` : ''}।</p>;
}
