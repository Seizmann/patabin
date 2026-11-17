import { formatMoney, toBnDigits } from '@patabin/shared';

function niceStep(max: number): number {
  if (max <= 0) return 1000;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

export default function IncomeBar({ data }: { data: { day: string; income: number }[] }) {
  const max = Math.max(...data.map((d) => d.income), 1);
  const step = niceStep(max);
  const top = step * 3;
  const maxIdx = data.reduce((best, d, i) => (d.income > (data[best]?.income ?? 0) ? i : best), 0);
  const cols = `repeat(${data.length}, minmax(0, 1fr))`;

  return (
    <div className="card p-5">
      <p className="p-label mb-4 text-center">দৈনিক আয়</p>
      {data.length === 0 ? (
        <div className="flex h-52 items-center justify-center">
          <p className="p-caption">এই সময়ে কোনো আয় নেই।</p>
        </div>
      ) : (
        <div role="group" aria-label="দৈনিক আয়">
          <div className="relative h-52">
            {[0, 1, 2, 3].map((i) => {
              const v = top - i * step;
              return (
                <span
                  key={i}
                  className="p-num absolute left-0 w-12 -translate-y-1/2 text-right text-[10px] leading-none text-ink-mute"
                  style={{ top: `${(i / 3) * 100}%` }}
                >
                  {v === 0 ? toBnDigits(0) : `${toBnDigits(Math.round(v / 1000))}হাজার`}
                </span>
              );
            })}
            <div className="absolute inset-y-0 left-14 right-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 border-t border-hairline"
                  style={{ top: `${(i / 3) * 100}%` }}
                />
              ))}
              <div className="absolute inset-x-0 bottom-0 border-t border-hairline" />
              <div className="grid h-full" style={{ gridTemplateColumns: cols }}>
                {data.map((d, i) => {
                  const h = Math.max((d.income / top) * 100, 0);
                  return (
                    <div key={d.day} className="group relative flex h-full items-end justify-center">
                      <button
                        type="button"
                        className={`chart-bar w-7 rounded-t-md ${i === maxIdx ? 'chart-bar-max' : ''}`}
                        style={{ height: `${h}%`, animationDelay: `${i * 110}ms` }}
                        aria-label={`${toBnDigits(d.day.slice(8))} তারিখ — ${formatMoney(d.income)}`}
                      />
                      <span
                        className="chart-value p-num pointer-events-none absolute whitespace-nowrap text-[11px] font-bold leading-none text-ink-mute transition-colors duration-200 group-hover:text-espresso group-focus-within:text-espresso"
                        style={{ bottom: `calc(${h}% + 6px)`, animationDelay: `${360 + i * 110}ms` }}
                      >
                        {formatMoney(d.income)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-2 grid pl-14" style={{ gridTemplateColumns: cols }}>
            {data.map((d) => (
              <span key={d.day} className="p-num text-center text-[11px] text-ink-mute">
                {toBnDigits(d.day.slice(8))}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
