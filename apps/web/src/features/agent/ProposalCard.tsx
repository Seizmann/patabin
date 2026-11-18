import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { Btn, Card, Notice } from 'components/ui/base';
import { formatMoney } from '@patabin/shared';
import bn from 'i18n/bn';
import { approveAction, rejectAction, type PendingAction } from './chat/api';

type Delta = { wallet_id?: string; partner_id?: string; packet_id?: string; balance?: number; remaining?: number; delta?: number };
type Allocation = { packet_id: string; packet_code: string; owner_name: string; qty: number };
type Receive = { wallet_id: string; label: string; amount: number };
type Preview = {
  detail?: { allocations?: Allocation[]; receives?: Receive[] };
  deltas?: { wallets?: Delta[]; partners?: Delta[]; packets?: Delta[] };
};

export function proposalStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return bn.agentProposalAwaiting;
    case 'executed':
      return bn.agentProposalExecuted;
    case 'rejected':
      return bn.agentProposalRejected;
    case 'expired':
      return bn.agentProposalExpired;
    case 'failed':
      return bn.agentProposalFailed;
    case 'stale':
      return bn.agentProposalStale;
    default:
      return status;
  }
}

export function proposalMinutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60000));
}

type NameMaps = {
  partners: Map<string, string>;
  wallets: Map<string, string>;
  categories: Map<string, string>;
  packets: Map<string, { code: string; owner: string; chalan: string }>;
};

export function useNameMaps(): NameMaps {
  const { data: partners = [] } = useQuery({
    queryKey: ['agent-name-partners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('partners').select('id, name').is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const { data: wallets = [] } = useQuery({
    queryKey: ['agent-name-wallets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wallets').select('id, type, name, label');
      if (error) throw error;
      return (data ?? []) as { id: string; type: string; name: string; label: string }[];
    },
    staleTime: 60_000,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['agent-name-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 60_000,
  });
  const { data: packets = [] } = useQuery({
    queryKey: ['agent-name-packets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_packet_stock')
        .select('packet_id, packet_code, owner_name, chalan_code')
        .eq('chalan_status', 'open');
      if (error) throw error;
      return (data ?? []) as { packet_id: string; packet_code: string; owner_name: string; chalan_code: string }[];
    },
    staleTime: 30_000,
  });
  return useMemo(
    () => ({
      partners: new Map(partners.map((p) => [p.id, p.name])),
      wallets: new Map(wallets.map((w) => [w.id, w.label || w.name || w.type])),
      categories: new Map(categories.map((c) => [c.id, c.name])),
      packets: new Map(packets.map((p) => [p.packet_id, { code: `${p.chalan_code}/${p.packet_code}`, owner: p.owner_name, chalan: p.chalan_code }])),
    }),
    [partners, wallets, categories, packets],
  );
}

function Row({ label, value, tag }: { label: string; value: string; tag?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-ink-mute">{label}</span>
      <span className="text-right font-semibold">
        {value}
        {tag && <span className="ml-1 rounded-full bg-canvas px-2 py-0.5 text-[10px] text-ink-mute">{bn.agentDefaultTag}</span>}
      </span>
    </div>
  );
}

function DeltaList({ title, rows, map }: { title: string; rows: Delta[]; map: (d: Delta) => string | undefined }) {
  const changed = (rows ?? []).filter((d) => (d.delta ?? 0) !== 0);
  if (changed.length === 0) return null;
  return (
    <div>
      <p className="p-label">{title}</p>
      <div className="mt-1 flex flex-col divide-y divide-hairline">
        {changed.map((d, i) => (
          <div key={i} className="flex justify-between py-1 text-sm">
            <span>{map(d) ?? '-'}</span>
            <span className={Number(d.delta) > 0 ? 'font-semibold text-good' : 'font-semibold text-bad'}>
              {Number(d.delta) > 0 ? '+' : ''}
              {formatMoney(Number(d.delta))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProposalCard({ action, onDecided }: { action: PendingAction; onDecided: () => void }) {
  const qc = useQueryClient();
  const names = useNameMaps();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [outcome, setOutcome] = useState<{ status: string; error?: string } | null>(null);
  const isPending = action.status === 'pending' && !outcome;

  useEffect(() => {
    if (!isPending) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [isPending]);

  const payload = action.payload ?? {};
  const preview = (action.preview ?? {}) as Preview;
  const defaults = action.defaults_used ?? [];
  const minutesLeft = proposalMinutesLeft(action.expires_at, now);
  const status = outcome?.status ?? action.status;

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError('');
    try {
      if (approve) {
        const res = await approveAction(action.id, action.preview_hash);
        setOutcome({ status: String(res.status ?? 'executed'), error: res.error ? String(res.error) : undefined });
      } else {
        await rejectAction(action.id);
        setOutcome({ status: 'rejected' });
      }
      onDecided();
      void qc.invalidateQueries({ queryKey: ['agent-pending-actions'] });
    } catch (e) {
      setError(e instanceof Error && e.message === 'RATE_LIMITED' ? bn.agentErrorGeneric : bn.agentTestUnreachable);
    }
    setBusy(false);
  };

  const body = (() => {
    switch (action.tool) {
      case 'propose_sale': {
        const qty = Number(payload.qty ?? 0);
        const list = Number(payload.list_unit_price ?? 0);
        const received = Number(payload.amount_received ?? 0);
        const discount = qty * list - received;
        return (
          <>
            <Row label={bn.agentSaleQty} value={`${qty} পিস`} />
            <Row label={bn.agentSaleListPrice} value={`${formatMoney(list)} × ${qty}`} />
            <Row label={bn.agentSaleReceived} value={formatMoney(received)} />
            {discount > 0 && <Row label={bn.agentSaleDiscount} value={formatMoney(discount)} />}
            {discount === 0 && defaults.includes('amount_received') && <Row label={bn.agentSaleDiscount} value={formatMoney(0)} tag />}
            {payload.wallet_account_id && (
              <Row label={bn.agentSaleWallet} value={names.wallets.get(String(payload.wallet_account_id)) ?? '…'} />
            )}
            {(preview.detail?.receives ?? []).map((r, i) => (
              <Row key={i} label={bn.agentSaleReceived} value={`${r.label}: ${formatMoney(Number(r.amount))}`} />
            ))}
            {payload.customer_name && <Row label={bn.agentSaleCustomer} value={String(payload.customer_name)} />}
            {payload.customer_phone && <Row label={bn.agentSaleCustomer} value={String(payload.customer_phone)} />}
            {(preview.detail?.allocations ?? []).length > 0 && (
              <div>
                <p className="p-label mt-2">{bn.agentSalePackets}</p>
                <div className="mt-1 flex flex-col divide-y divide-hairline">
                  {(preview.detail?.allocations ?? []).map((a, i) => (
                    <div key={i} className="flex justify-between py-1 text-sm">
                      <span>
                        {a.packet_code} · {a.owner_name}
                      </span>
                      <span className="font-semibold">{a.qty} পিস</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DeltaList title={bn.agentBalanceEffect} rows={preview.deltas?.partners ?? []} map={(d) => names.partners.get(String(d.partner_id))} />
            <DeltaList title={bn.agentStockEffect} rows={preview.deltas?.packets ?? []} map={(d) => names.packets.get(String(d.packet_id))?.code} />
          </>
        );
      }
      case 'propose_expense':
        return (
          <>
            <Row label={bn.agentExpenseCategory} value={names.categories.get(String(payload.category_id)) ?? '…'} />
            <Row label={bn.agentExpenseAmount} value={formatMoney(Number(payload.amount ?? 0))} />
            <Row label={bn.agentExpensePaidBy} value={names.partners.get(String(payload.paid_by_partner_id)) ?? '…'} />
            <Row label={bn.agentExpenseAttributed} value={names.partners.get(String(payload.attributed_to_partner_id)) ?? '…'} />
            <Row
              label={bn.agentExpenseSource}
              value={payload.wallet_account_id ? (names.wallets.get(String(payload.wallet_account_id)) ?? '…') : bn.agentOwnPocket}
            />
            <DeltaList title={bn.agentBalanceEffect} rows={preview.deltas?.partners ?? []} map={(d) => names.partners.get(String(d.partner_id))} />
            <DeltaList title={bn.agentStockEffect} rows={preview.deltas?.wallets ?? []} map={(d) => names.wallets.get(String(d.wallet_id))} />
          </>
        );
      case 'propose_personal_use':
        return (
          <>
            <Row label={bn.agentPersonalEater} value={names.partners.get(String(payload.eater_partner_id)) ?? '…'} tag={defaults.includes('eater_partner_id')} />
            {payload.packet_id ? (
              <Row label={bn.agentPersonalSource} value={names.packets.get(String(payload.packet_id))?.code ?? '…'} />
            ) : (
              <Row label={bn.agentPersonalSource} value={bn.agentPersonalKept} />
            )}
            <Row label={bn.agentSaleQty} value={`${payload.qty} পিস`} />
            <Row label={bn.agentPersonalUnitValue} value={formatMoney(Number(payload.unit_value ?? 0))} tag={defaults.includes('unit_value')} />
            <DeltaList title={bn.agentBalanceEffect} rows={preview.deltas?.partners ?? []} map={(d) => names.partners.get(String(d.partner_id))} />
            {payload.packet_id && (
              <DeltaList title={bn.agentStockEffect} rows={preview.deltas?.packets ?? []} map={(d) => names.packets.get(String(d.packet_id))?.code} />
            )}
          </>
        );
      case 'propose_adjustment': {
        const packet = names.packets.get(String(payload.packet_id));
        const qty = Number(payload.qty ?? 0);
        return (
          <>
            <Row label={bn.agentAdjustmentPacket} value={packet ? `${packet.code} · ${packet.owner}` : '…'} />
            <Row label={bn.agentAdjustmentQty} value={`${qty} পিস`} />
            <Row label={bn.agentAdjustmentReason} value={String(payload.reason ?? '')} />
            {payload.person && <Row label={bn.agentAdjustmentPerson} value={String(payload.person)} />}
            <Row label={bn.agentStockEffect} value={`${packet?.code ?? ''}: −${qty}`} />
          </>
        );
      }
      default:
        return <pre className="p-caption overflow-x-auto whitespace-pre-wrap">{JSON.stringify(payload, null, 1)}</pre>;
    }
  })();

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="p-title text-sm">
          {bn.agentProposals} · {proposalStatusLabel(status)}
        </p>
        {isPending && (
          <span className="p-caption text-ink-mute">
            {bn.agentProposalExpireIn} {minutesLeft} {bn.agentProposalExpireUnit}
          </span>
        )}
      </div>
      {defaults.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {defaults.map((d) => (
            <span key={d} className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-ink-mute">
              {d} · {bn.agentDefaultTag}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col divide-y divide-hairline">{body}</div>
      {action.error && status !== 'pending' && <Notice tone="error">{action.error}</Notice>}
      {outcome?.error && <Notice tone="error">{outcome.error}</Notice>}
      {status === 'stale' && <Notice tone="info">{bn.agentProposalStale}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {isPending ? (
        <div className="flex gap-2">
          <Btn disabled={busy || minutesLeft <= 0} busy={busy} onClick={() => void decide(true)}>
            {bn.agentApprove}
          </Btn>
          <Btn variant="ghost" disabled={busy} onClick={() => void decide(false)}>
            {bn.agentReject}
          </Btn>
        </div>
      ) : (
        status === 'executed' && action.result_id && <Notice tone="ok">{bn.agentEventExecuted}</Notice>
      )}
    </Card>
  );
}

export function ApproveAllButton({ actions, onDone }: { actions: PendingAction[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (actions.length < 2) return null;
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { approveAllActions } = await import('./chat/api');
      await approveAllActions(actions.map((a) => ({ id: a.id, preview_hash: a.preview_hash })));
      onDone();
    } catch {
      setError(bn.agentTestUnreachable);
    }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="max-w-48">
        <Btn busy={busy} onClick={() => void run()}>
          {bn.agentApproveAll}
        </Btn>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
