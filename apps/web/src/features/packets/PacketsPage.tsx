import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVertical } from '@phosphor-icons/react';
import { createPackets, fetchPackets, savePriority, type PacketRow } from './api';
import { supabase } from 'lib/supabase';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import TimeInput from 'components/forms/TimeInput';
import { mapError } from 'lib/errors';
import { toBnDigits } from '@patabin/shared';

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
                  return <PacketCard key={id} p={p} busy={busy} />;
                })}
              </div>
            </SortableContext>
          </DndContext>
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

function PacketCard({ p, busy }: { p: PacketRow; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.packet_id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card flex touch-none items-center gap-3 px-4 py-3 ${isDragging ? 'opacity-50' : ''}`}
      aria-label={`প্যাকেট ${p.packet_code}`}
      aria-disabled={busy}
    >
      <button type="button" className="grid h-11 w-8 place-items-center text-ink-mute" {...listeners} {...attributes} aria-label={`প্যাকেট সরান ${p.packet_code}`}>
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
