import { useEffect, useMemo, useState } from 'react';
import { formatDhakaDate, formatMoney, toBnDigits } from '@patabin/shared';

type DayPoint = { day: string; income: number };

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

const W = 720;
const H = 220;
const PAD_L = 58;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 12;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function buildPath(rows: DayPoint[], count: number, top: number, y: (v: number) => number): string {
  const x = (i: number) => PAD_L + (count <= 1 ? PLOT_W / 2 : (i / (count - 1)) * PLOT_W);
  return rows
    .slice(0, count)
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Math.min(d.income, top)).toFixed(1)}`)
    .join(' ');
}

export default function IncomeBar({ data, prevData = [] }: { data: DayPoint[]; prevData?: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.income, 0);
  const prevTotal = prevData.reduce((s, d) => s + d.income, 0);
  const shownTotal = useCountUp(total, 250);
  const pct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const up = (pct ?? 0) >= 0;

  const max = Math.max(...data.map((d) => d.income), ...prevData.map((d) => d.income), 1);
  const step = niceStep(max);
  const top = step * 3;
  const n = data.length;
  const x = (i: number) => PAD_L + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => PAD_T + PLOT_H - (Math.min(v, top) / top) * PLOT_H;

  const ticks = useMemo(() => {
    if (n === 0) return [];
    const count = Math.min(n, 6);
    if (count === 1) return [0];
    return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
  }, [n]);

  const hoverPrev = hover != null ? prevData[hover] : undefined;

  if (data.length === 0) {
    return (
      <div className="card p-5">
        <p className="p-label mb-4 text-center">দৈনিক আয়</p>
        <div className="flex h-52 items-center justify-center">
          <p className="p-caption">এই সময়ে কোনো আয় নেই।</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-start justify-between gap-3">
        <p className="p-label">দৈনিক আয়</p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-mute">
            <span aria-hidden className="h-2 w-2 rounded-sm bg-good" /> এই সময়
          </span>
          {prevData.length > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-mute">
              <span aria-hidden className="h-2 w-2 rounded-sm bg-ink-mute/35" /> আগের সময়
            </span>
          )}
        </div>
      </div>
      <p className="p-num text-3xl font-extrabold">{formatMoney(Math.round(shownTotal))}</p>
      {pct != null && (
        <p className={`p-caption p-num mt-0.5 ${up ? 'text-good' : 'text-bad'}`}>
          {up ? '↗' : '↘'} {toBnDigits(Math.abs(pct))}% আগের সময়ের তুলনায়
        </p>
      )}

      <div role="group" aria-label="দৈনিক আয়" className="relative mt-4">
        <div className="relative h-56">
          {[0, 1, 2, 3].map((i) => {
            const v = top - i * step;
            return (
              <span
                key={i}
                className="chart-grid p-num absolute left-0 w-12 -translate-y-1/2 text-right text-[10px] leading-none text-ink-mute"
                style={{ top: `${(y(v) / H) * 100}%` }}
              >
                {v === 0 ? toBnDigits(0) : `${toBnDigits(Math.round(v / 1000))}হাজার`}
              </span>
            );
          })}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {[0, 1, 2, 3].map((i) => {
              const yy = y(top - i * step);
              return (
                <line
                  key={i}
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yy}
                  y2={yy}
                  stroke={i === 3 ? 'var(--color-hairline)' : 'color-mix(in srgb, var(--color-hairline) 60%, transparent)'}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {prevData.length > 0 && (
              <path
                d={buildPath(prevData, Math.min(prevData.length, n), top, y)}
                fill="none"
                stroke="var(--color-ink-mute)"
                strokeOpacity={0.35}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={buildPath(data, n, top, y)}
              fill="none"
              stroke="var(--color-good)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover != null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD_T}
                y2={PAD_T + PLOT_H}
                stroke="var(--color-hairline)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {hover != null && hover < n && (
              <>
                <circle cx={x(hover)} cy={y(data[hover]!.income)} r={4} fill="var(--color-good)" stroke="var(--color-surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {hoverPrev && <circle cx={x(hover)} cy={y(hoverPrev.income)} r={3.5} fill="var(--color-ink-mute)" stroke="var(--color-surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
              </>
            )}
          </svg>
          <div className="absolute inset-y-0 left-14 right-0 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                tabIndex={-1}
                className="h-full"
                aria-label={`${toBnDigits(d.day.slice(8))} তারিখ — ${formatMoney(d.income)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            ))}
          </div>
          {hover != null && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-hairline bg-surface px-3 py-1.5 text-center shadow-md"
              style={{ left: `${(Math.min(Math.max(x(hover), 60), W - 60) / W) * 100}%`, bottom: 'calc(100% + 2px)' }}
            >
              <p className="p-caption p-num leading-tight">{formatDhakaDate(`${data[hover]!.day}T00:00:00+06:00`)}</p>
              <p className="p-num text-sm font-bold leading-tight">{formatMoney(data[hover]!.income)}</p>
              {hoverPrev && <p className="p-caption p-num leading-tight">আগে: {formatMoney(hoverPrev.income)}</p>}
            </div>
          )}
        </div>
        <div className="relative mt-1 h-4">
          {ticks.map((i) => (
            <span
              key={i}
              className="chart-day p-num absolute -translate-x-1/2 text-[11px] text-ink-mute"
              style={{ left: `${(x(i) / W) * 100}%` }}
            >
              {toBnDigits(data[i]!.day.slice(8))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
