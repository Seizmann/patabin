import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVertical } from '@phosphor-icons/react';
import { createPackets, fetchPacketDetail, fetchPackets, savePriority, type PacketDetail, type PacketRow } from './api';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { mapError } from 'lib/errors';
import { formatDhakaDate, formatMoney, toBnDigits } from '@patabin/shared';
import { walletDisplay } from 'lib/wallet';

export default function PacketsPage() {
  usePageTitle('প্যাকেট');
  const qc = useQueryClient();
  const { data: all = [], isPending } = useQuery({ queryKey: ['packets'], queryFn: fetchPackets });
  const { data: openChalans = [] } = useQuery({
    queryKey: ['open-chalan-pack'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chalans').select('id, code, pcs_per_packet').eq('status', 'open').is('deleted_at', null).order('purchase_date');
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; pcs_per_packet: number }[];
    },
  });
  const packets = all.filter((p) => p.chalan_status === 'open').sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
  const [order, setOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [detail, setDetail] = useState<PacketRow | null>(null);

  useEffect(() => {
    setOrder(packets.map((p) => p.packet_id));
  }, [all.length, packets.map((p) => p.packet_id).join(',')]);

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const persist = async (next: string[]) => {
    setOrder(next);
    setBusy(true);
    setError('');
    setOk('');
    try {
      await savePriority(next);
      await qc.invalidateQueries({ queryKey: ['packets'] });
      setOk('বিক্রির ক্রম সংরক্ষিত');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((cur) => {
      const oldIdx = cur.indexOf(String(active.id));
      const newIdx = cur.indexOf(String(over.id));
      const next = arrayMove(cur, oldIdx, newIdx);
      void persist(next);
      return next;
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageTitle tag="PataBin" title="প্যাকেট" />
      <Notice tone="info">টেনে উপর-নিচ করে বিক্রির ক্রম বদলান — বিক্রি এই ক্রমেই পরিমাণ কাটা হবে।</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}

      {isPending ? (
        <Card className="p-6">
          <div className="skeleton h-10 w-full" />
        </Card>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {order.map((id) => {
                  const p = packets.find((x) => x.packet_id === id);
                  if (!p) return null;
                  return <PacketCard key={id} p={p} busy={busy} onOpen={() => setDetail(p)} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
          {detail && <PacketDetailSheet p={detail} onClose={() => setDetail(null)} />}
          {order.length === 0 && (
            <Card className="p-6">
              <p className="p-caption text-ink-mute">খোলা চালানে কোনো প্যাকেট নেই। নিচে প্যাকিং করুন।</p>
            </Card>
          )}
        </>
      )}

      {openChalans.map((c) => (
        <PackSheet key={c.id} chalanId={c.id} code={c.code} size={c.pcs_per_packet} onDone={() => qc.invalidateQueries({ queryKey: ['packets'] })} />
      ))}
    </div>
  );
}

function PacketCard({ p, busy, onOpen }: { p: PacketRow; busy: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.packet_id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={busy ? undefined : onOpen}
      className={`card flex items-center gap-3 px-4 py-3 ${isDragging ? 'opacity-50' : ''}`}
      aria-label={`প্যাকেট ${p.packet_code} — বিস্তারিত খুলুন`}
    >
      <button
        type="button"
        className="grid h-11 w-8 touch-none place-items-center text-ink-mute"
        onClick={(e) => e.stopPropagation()}
        {...listeners}
        {...attributes}
        aria-label={`প্যাকেট সরান ${p.packet_code}`}
      >
        <DotsSixVertical weight="regular" size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {p.chalan_code}/{p.packet_code} · {p.owner_name}
        </p>
      </div>
      <p className="text-sm font-semibold">
        {toBnDigits(p.remaining)}/{toBnDigits(p.total_pcs)}
      </p>
    </div>
  );
}

const ADJ_REASON_BN: Record<string, string> = {
  damage: 'নষ্ট',
  loss: 'হারানো',
  gift: 'ফ্রি',
  sample: 'স্যাম্পল',
  other: 'অন্য',
};

function PacketDetailSheet({ p, onClose }: { p: PacketRow; onClose: () => void }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['packet-detail', p.packet_id],
    queryFn: () => fetchPacketDetail(p.packet_id),
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const d: PacketDetail | undefined = data;
  const sold = d?.totals.sold ?? 0;
  const due = d?.totals.due ?? 0;
  const received = d?.totals.received ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="card relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 lg:rounded-b-[24px]" role="dialog" aria-modal="true" aria-label={`প্যাকেট ${p.packet_code} বিস্তারিত`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="p-title">
              {p.chalan_code}/{p.packet_code}
            </p>
            <p className="p-caption">মালিক: {p.owner_name}</p>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            বন্ধ
          </Btn>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-canvas px-2 py-3">
            <p className="p-caption text-ink-mute">মোট পিস</p>
            <p className="text-base font-bold">{toBnDigits(p.total_pcs)}</p>
          </div>
          <div className="rounded-xl bg-canvas px-2 py-3">
            <p className="p-caption text-ink-mute">বিক্রি</p>
            <p className="text-base font-bold">{toBnDigits(sold)}</p>
          </div>
          <div className="rounded-xl bg-canvas px-2 py-3">
            <p className="p-caption text-ink-mute">বাকি পিস</p>
            <p className="text-base font-bold">{toBnDigits(p.remaining)}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-canvas px-2 py-3">
            <p className="p-caption text-ink-mute">নেওয়া টাকা</p>
            <p className="text-sm font-bold text-good">{formatMoney(received)}</p>
          </div>
          <div className="rounded-xl bg-canvas px-2 py-3">
            <p className="p-caption text-ink-mute">বাকি টাকা</p>
            <p className={`text-sm font-bold ${due > 0 ? 'text-bad' : 'text-good'}`}>{formatMoney(due)}</p>
          </div>
          <div className="rounded-xl bg-canvas px-2 py-3">
            <p className="p-caption text-ink-mute">নষ্ট+খাওয়া</p>
            <p className="text-base font-bold">{toBnDigits((d?.totals.adjusted ?? 0) + (d?.totals.personal ?? 0))}</p>
          </div>
        </div>
        {error ? (
          <Notice tone="error">{mapError(error)}</Notice>
        ) : isPending ? (
          <div className="skeleton mt-4 h-16 w-full" />
        ) : (
          d && (
            <>
              <p className="p-label mt-5">কে কিনেছে</p>
              {d.byCustomer.length === 0 ? (
                <p className="p-caption mt-2 text-ink-mute">এখনো কোনো বিক্রি হয়নি।</p>
              ) : (
                <ul className="mt-2 flex flex-col">
                  {d.byCustomer.map((c) => (
                    <li key={c.key} className="flex items-start gap-3 border-b border-hairline py-2.5 last:border-none">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {c.customer_name || 'ক্রেতা'}
                          {c.customer_phone ? ` · ${c.customer_phone}` : ''}
                        </p>
                        <p className="p-caption text-ink-mute">{toBnDigits(c.pcs)} পিস</p>
                        {c.methods.length > 0 && (
                          <p className="p-caption mt-1 flex flex-wrap gap-x-2 gap-y-1">
                            {c.methods.map((m, i) => (
                              <span key={i} className="rounded-full bg-canvas px-2 py-0.5 text-ink-mute">
                                {walletDisplay({ type: m.type, label: m.label })} {formatMoney(m.amount)}
                              </span>
                            ))}
                          </p>
                        )}
                        {c.paid_due > 0 && <p className="p-caption mt-1 text-good">বাকি থেকে জমা {formatMoney(c.paid_due)}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-good">{formatMoney(c.received)}</p>
                        {c.due > 0 && <p className="p-caption text-bad">বাকি {formatMoney(c.due)}</p>}
                        {c.due <= 0 && <p className="p-caption text-good">পরিশোধিত</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {d.byMethod.length > 0 && (
                <>
                  <p className="p-label mt-5">টাকা কীভাবে এসেছে</p>
                  <div className="mt-2 flex flex-col divide-y divide-hairline">
                    {d.byMethod.map((m, i) => (
                      <div key={i} className="flex items-center justify-between py-2 text-sm">
                        <span>{walletDisplay({ type: m.type, label: m.label })}</span>
                        <span>{formatMoney(m.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 text-sm font-bold">
                      <span>মোট</span>
                      <span>{formatMoney(received)}</span>
                    </div>
                  </div>
                </>
              )}
              {d.duePayments.length > 0 && (
                <>
                  <p className="p-label mt-5">বাকি পরিশোধ</p>
                  <div className="mt-2 flex flex-col divide-y divide-hairline">
                    {d.duePayments.map((x, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{x.customer_name || 'ক্রেতা'}</p>
                          <p className="p-caption text-ink-mute">
                            {walletDisplay({ type: x.type, label: x.label })} · {formatDhakaDate(x.at)}
                          </p>
                        </div>
                        <p className="font-semibold text-good">{formatMoney(x.amount)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {d.adjustments.length > 0 && (
                <>
                  <p className="p-label mt-5">নষ্ট / ফ্রি</p>
                  <div className="mt-2 flex flex-col divide-y divide-hairline">
                    {d.adjustments.map((a, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {ADJ_REASON_BN[a.reason] ?? a.reason} · {toBnDigits(a.qty)}
                          </p>
                          <p className="p-caption text-ink-mute">
                            {a.person ? `${a.person} · ` : ''}
                            {formatDhakaDate(a.at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {d.personal.length > 0 && (
                <>
                  <p className="p-label mt-5">পার্সোনাল খাওয়া</p>
                  <div className="mt-2 flex flex-col divide-y divide-hairline">
                    {d.personal.map((u, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold">{u.eater_name || 'পার্টনার'}</p>
                          <p className="p-caption text-ink-mute">{formatDhakaDate(u.at)}</p>
                        </div>
                        <p className="text-sm font-semibold">{toBnDigits(u.qty)} পিস</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-canvas px-4 py-3">
                <p className="text-sm font-semibold">মোট বাকি</p>
                <p className={`text-sm font-bold ${due > 0 ? 'text-bad' : 'text-good'}`}>{formatMoney(due)}</p>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

function PackSheet({ chalanId, code, size, onDone }: { chalanId: string; code: string; size: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [sz, setSz] = useState(String(size));
  const [rows, setRows] = useState<{ id: string; name: string; pcs: string }[]>([]);
  const [at, setAt] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data: partners = [] } = useQuery({
    queryKey: ['partners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('partners').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    setRows(partners.map((p) => ({ id: p.id, name: p.name, pcs: '' })));
  }, [partners]);

  const submit = async () => {
    setError('');
    const items = rows.filter((r) => Number(r.pcs) > 0).map((r) => ({ partner_id: r.id, pcs: Number(r.pcs) }));
    if (items.length === 0) {
      setError('কমপক্ষে এক পার্টনারের পিস দিন।');
      return;
    }
    setBusy(true);
    try {
      await createPackets({ chalan_id: chalanId, pcs_per_packet: Number(sz), packed_at: at ?? null, items });
      await onDone();
      setOpen(false);
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="p-title">{code}</p>
          <p className="p-caption">বাকি পিস প্যাকেটে সাজান</p>
        </div>
        <Btn onClick={() => setOpen((o) => !o)}>{open ? 'বন্ধ' : 'প্যাকিং করুন'}</Btn>
      </div>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="mt-4 flex flex-col gap-4"
          noValidate
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="প্রতি প্যাকেটে পিস">
              <NumberInput value={sz} onChange={setSz} />
            </Field>
            <Field label="সময়">
              <TimeInput value={at} onChange={setAt} />
            </Field>
          </div>
          {rows.map((r) => (
            <Field key={r.id} label={r.name}>
              <NumberInput value={r.pcs} onChange={(v) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, pcs: v } : x)))} placeholder="পিস" />
            </Field>
          ))}
          {error && <Notice tone="error">{error}</Notice>}
          <Btn type="submit" busy={busy}>
            প্যাকেট তৈরি করুন
          </Btn>
        </form>
      )}
    </Card>
  );
}
