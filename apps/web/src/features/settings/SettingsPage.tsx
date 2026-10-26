import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';
import { mapError } from 'lib/errors';

export default function SettingsPage() {
  usePageTitle('সেটিংস');
  const { suAdmin } = useAuth();
  const qc = useQueryClient();
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [size, setSize] = useState('');
  const [catName, setCatName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: settings, isPending } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('default_buy_rate, default_sell_price, default_packet_size').eq('id', 1).single();
      if (error) throw error;
      return data as { default_buy_rate: number; default_sell_price: number; default_packet_size: number };
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('id, name').order('created_at');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError('');
    setOk('');
    const { error: err } = await supabase
      .from('settings')
      .update({
        default_buy_rate: Number(buy || settings.default_buy_rate),
        default_sell_price: Number(sell || settings.default_sell_price),
        default_packet_size: Number(size || settings.default_packet_size),
      })
      .eq('id', 1);
    setBusy(false);
    if (err) setError('সংরক্ষণ হয়নি; শুধু সুপার অ্যাডমিন পরিবর্তন করতে পারেন।');
    else {
      setOk('সংরক্ষিত।');
      await qc.invalidateQueries({ queryKey: ['settings'] });
    }
  };

  const addCategory = async () => {
    if (!catName) return;
    setError('');
    setBusy(true);
    try {
      const { error: err } = await supabase.from('expense_categories').insert({ name: catName });
      if (err) throw err;
      await qc.invalidateQueries({ queryKey: ['expense-categories'] });
      setCatName('');
    } catch (err) {
      setError(mapError(err));
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <PageTitle tag="PataBin" title="সেটিংস" />
      {isPending ? (
        <div className="card p-6" aria-busy>
          <Skeleton className="h-12 w-56" />
          <Skeleton className="mt-3 h-12 w-56" />
        </div>
      ) : (
        <Card className="flex flex-col gap-5 p-6">
          <SettingField label="ডিফল্ট কেনা দর (কেনা বেচার কস্ট)" current={String(settings?.default_buy_rate ?? '-')} editable={suAdmin} value={buy || String(settings?.default_buy_rate ?? '')} onChange={setBuy} />
          <SettingField label="ডিফল্ট বিক্রির দর" current={String(settings?.default_sell_price ?? '-')} editable={suAdmin} value={sell || String(settings?.default_sell_price ?? '')} onChange={setSell} />
          <SettingField label="ডিফল্ট প্যাকেটে পিস" current={String(settings?.default_packet_size ?? '-')} editable={suAdmin} value={size || String(settings?.default_packet_size ?? '')} onChange={setSize} />
          {error && <Notice tone="error">{error}</Notice>}
          {ok && <Notice tone="ok">{ok}</Notice>}
          {!suAdmin && <Notice tone="info">ডিফল্ট দরগুলো শুধু সুপার অ্যাডমিন বদলাতে পারেন; আপনি দেখতে পারছেন।</Notice>}
          <div className="max-w-40">
            <Btn disabled={!suAdmin} busy={busy} onClick={() => void save()}>
              সংরক্ষণ করুন
            </Btn>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-4 p-6">
        <p className="p-label">খরচের ক্যাটাগরি</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="rounded-full bg-canvas px-3 py-1 text-sm">
              {c.name}
            </span>
          ))}
        </div>
        {suAdmin && (
          <div className="flex items-end gap-2">
            <input className="field max-w-xs" placeholder="নতুন ক্যাটাগরি" value={catName} onChange={(e) => setCatName(e.target.value)} />
            <Btn busy={busy} onClick={() => void addCategory()}>
              যোগ করুন
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

function SettingField({ label, current, editable, value, onChange }: { label: string; current: string; editable: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="p-caption mb-1 block font-semibold text-ink">{label}</span>
      {editable ? <NumberInput value={value} onChange={onChange} /> : <p className="field">{Number(current) ? Number(current).toLocaleString('en-IN') : '-'}</p>}
    </div>
  );
}
