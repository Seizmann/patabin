import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { dbDateTime, dhakaDate, DHAKA, formatDhakaDateTime } from '@patabin/shared';

export default function TimeInput({ value, onChange }: { value?: string; onChange?: (ts?: string) => void }) {
  const { data: serverNow } = useQuery({
    queryKey: ['server-now'],
    staleTime: 20_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('server_now');
      return (data as string | null) ?? null;
    },
  });
  const [customOn, setCustomOn] = useState(false);
  const [text, setText] = useState<string | undefined>(undefined);

  const instant = value ?? serverNow ?? new Date().toISOString();
  const timeParts = new Intl.DateTimeFormat('en-GB', { timeZone: DHAKA, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(instant))
    .padStart(5, '0');
  const initial = `${dhakaDate(instant)}T${timeParts.slice(0, 5)}`;

  const toggle = (on: boolean) => {
    setCustomOn(on);
    if (!on) {
      setText(undefined);
      onChange?.(undefined);
    }
  };

  return (
    <div>
      <p className="p-num text-sm">{formatDhakaDateTime(instant)}</p>
      {customOn && (
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="datetime-local"
            className="field"
            value={text ?? initial}
            onChange={(e) => {
              if (!e.target.value) return;
              setText(e.target.value);
              onChange?.(dbDateTime(e.target.value));
            }}
          />
          <button type="button" className="p-caption self-start font-semibold underline" onClick={() => toggle(false)}>
            বর্তমান সময় ব্যবহার করুন
          </button>
        </div>
      )}
      {!customOn && (
        <button type="button" className="p-caption mt-1 font-semibold text-cocoa underline" onClick={() => setCustomOn(true)}>
          নিজের সময় দিন
        </button>
      )}
    </div>
  );
}
