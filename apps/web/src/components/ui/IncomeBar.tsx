import { useEffect, useState } from 'react';
import { formatMoney, toBnDigits } from '@patabin/shared';

function niceStep(max: number): number {
  if (max <= 0) return 1000;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function useCountUp(target: number, delay: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(Math.max((t - start - delay) / 900, 0), 1);
      setValue(target * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay]);
  return value;
}

function BarColumn({ day, income, h, isMax, delay }: { day: string; income: number; h: number; isMax: boolean; delay: number }) {
  const shown = useCountUp(income, 400 + delay);
  return (
    <div className="group relative flex h-full items-end justify-center">
      <div className="absolute inset-x-1 inset-y-0 rounded-2xl bg-canvas opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100" />
      <button
        type="button"
        className={`chart-bar w-7 rounded-t-md ${isMax ? 'chart-bar-max' : ''}`}
        style={{ height: `${h}%`, animationDelay: `${delay}ms` }}
        aria-label={`${toBnDigits(day.slice(8))} তারিখ — ${formatMoney(income)}`}
      />
      <span
        className="chart-value p-num pointer-events-none absolute whitespace-nowrap text-[11px] font-bold leading-none text-ink-mute transition-colors duration-200 group-focus-within:text-espresso group-hover:text-espresso"
        style={{ bottom: `calc(${h}% + 6px)`, animationDelay: `${360 + delay}ms` }}
      >
        {formatMoney(Math.round(shown))}
      </span>
    </div>
  );
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
                  className="chart-grid p-num absolute left-0 w-12 -translate-y-1/2 text-right text-[10px] leading-none text-ink-mute"
                  style={{ top: `${(i / 3) * 100}%`, animationDelay: `${i * 70}ms` }}
                >
                  {v === 0 ? toBnDigits(0) : `${toBnDigits(Math.round(v / 1000))}হাজার`}
                </span>
              );
            })}
            <div className="absolute inset-y-0 left-14 right-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="chart-grid absolute inset-x-0 border-t border-hairline"
                  style={{ top: `${(i / 3) * 100}%`, animationDelay: `${i * 70}ms` }}
                />
              ))}
              <div className="chart-grid absolute inset-x-0 bottom-0 border-t border-hairline" />
              <div className="grid h-full" style={{ gridTemplateColumns: cols }}>
                {data.map((d, i) => (
                  <BarColumn
                    key={d.day}
                    day={d.day}
                    income={d.income}
                    h={Math.max((d.income / top) * 100, 0)}
                    isMax={i === maxIdx}
                    delay={i * 110}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-2 grid pl-14" style={{ gridTemplateColumns: cols }}>
            {data.map((d, i) => (
              <span
                key={d.day}
                className="chart-day p-num text-center text-[11px] text-ink-mute"
                style={{ animationDelay: `${250 + i * 110}ms` }}
              >
                {toBnDigits(d.day.slice(8))}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
