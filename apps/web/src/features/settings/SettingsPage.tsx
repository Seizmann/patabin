import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Notice, PageTitle, Skeleton } from 'components/ui/base';
import NumberInput from 'components/forms/NumberInput';

export default function SettingsPage() {
  usePageTitle('সেটিংস');
  const { suAdmin } = useAuth();
  const qc = useAsyncQueue();
  const [buy, setBuy] = useState<string | undefined>(undefined);
  const [sell, setSell] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const { data: settings, isPending } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('default_buy_rate, default_sell_price, updated_at').eq('id', 1).single();
      if (error) throw error;
      return data as { default_buy_rate: string | number; default_sell_price: string | number; updated_at: string };
    },
  });

  const savePrices = async () => {
    if (!settings) return;
    setBusy(true);
    setError('');
    setOk('');
    const { error: getUserErr, data: u } = await supabase.auth.getUser();
    if (getUserErr) {
      setBusy(false);
      setError(getUserErr.message);
      return;
    }
    const { error: saveErr } = await supabase
      .from('settings')
      .update({
        default_buy_rate: Number(buy ?? settings.default_buy_rate),
        default_sell_price: Number(sell ?? settings.default_sell_price),
        updated_by: u?.user?.id,
      })
      .eq('id', 1);
    setBusy(false);
    if (saveErr || !u.user) setError('সংরক্ষণ হয়নি; শুধু সুপার অ্যাডমিন পরিবর্তন করতে পারেন।');
    else {
      setOk('সংরক্ষিত।');
      await qc.invalidateQueries({ queryKey: ['settings'] });
    }
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
          <SettingField
            label="ডিফল্ট কেনা দর (ইউনিট কস্ট)"
            current={String(settings?.default_buy_rate ?? '-')}
            editable={suAdmin}
            value={buy ?? String(settings?.default_buy_rate ?? '')}
            onChange={setBuy}
          />
          <SettingField
            label="ডিফল্ট বিক্রির দর"
            current={String(settings?.default_sell_price ?? '-')}
            editable={suAdmin}
            value={sell ?? String(settings?.default_sell_price ?? '')}
            onChange={setSell}
          />
          {error && <Notice tone="error">{error}</Notice>}
          {ok && <Notice tone="ok">{ok}</Notice>}
          {!suAdmin && <Notice>দুটি ডিফল্ট দর শুধু সুপার অ্যাডমিন পরিবর্তন করতে পারেন; আপনি দেখতে পারছেন।</Notice>}
          <Btn disabled={!suAdmin} busy={busy} onClick={() => void savePrices()}>
            সংরক্ষণ করুন
          </Btn>
        </Card>
      )}
    </div>
  );
}

type Qc = { invalidateQueries: (p: { queryKey: string[] }) => Promise<void> };

function useAsyncQueue(): Qc {
  const qc = useQueryClient();
  return {
    invalidateQueries: async ({ queryKey }) => {
      await qc.invalidateQueries({ queryKey });
    },
  };
}

function SettingField({ label, current, editable, value, onChange }: { label: string; current: string; editable: boolean; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="p-caption mb-1 block font-semibold text-ink">{label}</span>
      {editable ? <NumberInput value={value} onChange={onChange} /> : <p className="field">{Number(current) ? Number(current).toLocaleString('en-IN') : '-'}</p>}
    </div>
  );
}
