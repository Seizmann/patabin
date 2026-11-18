import { formatMoney } from '@patabin/shared';

function lerpColor(t: number): string {
  const a = [31, 22, 17];
  const b = [220, 211, 196];
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, sweepDeg: number): string {
  const [x1, y1] = polar(cx, cy, r, 0);
  const [x2, y2] = polar(cx, cy, r, sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function toBn(v: number): string {
  return String(v).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);
}

export default function Donut({
  title,
  data,
  centerLabel,
  centerValue,
}: {
  title: string;
  data: { name: string; value: number }[];
  centerLabel: string;
  centerValue: string;
}) {
  const rows = [...data].sort((a, b) => b.value - a.value);
  const max = rows[0]?.value ?? 0;
  const total = rows.reduce((s, d) => s + d.value, 0);
  const n = rows.length;
  const cx = 105;
  const cy = 105;
  const rMax = 96;
  const rMin = 34;
  const thickness = n > 1 ? Math.min(14, (rMax - rMin) / (2 * n)) : 14;

  if (n === 0) {
    return (
      <div className="card p-5">
        <p className="p-label mb-4 text-center">{title}</p>
        <div className="flex h-52 items-center justify-center">
          <p className="p-caption">এই সময়ে কোনো আয় নেই।</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-2">
        <p className="p-label">{title}</p>
      </div>
      <div className="relative mx-auto h-56 w-full max-w-sm">
        <div className="absolute right-0 top-0 z-10 text-right">
          <p className="p-label">{centerLabel}</p>
          <p className="p-num text-xl font-extrabold">{centerValue}</p>
        </div>
        <ul className="absolute left-0 top-5 z-10 flex max-w-[42%] flex-col gap-1.5" role="list">
          {rows.map((d, i) => (
            <li key={d.name} className="flex items-center justify-between gap-2">
              <span className="p-caption truncate">{d.name}</span>
              <span className="p-num text-sm font-bold" style={{ color: lerpColor(n > 1 ? i / (n - 1) : 0) }}>
                {total > 0 ? toBn(Math.round((d.value * 100) / total)) : '০'}%
              </span>
            </li>
          ))}
        </ul>
        <svg viewBox="0 0 210 210" className="absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 chart-grid" role="img" aria-label={title}>
          {rows.map((d, i) => {
            const r = n > 1 ? rMax - (i * (rMax - rMin - thickness)) / (n - 1) : (rMax + rMin) / 2;
            const sweep = max > 0 ? (d.value / max) * 270 : 0;
            const color = lerpColor(n > 1 ? i / (n - 1) : 0);
            return (
              <path
                key={d.name}
                d={arcPath(cx, cy, r, sweep)}
                fill="none"
                stroke={color}
                strokeWidth={thickness}
                strokeLinecap="round"
              >
                <title>{`${d.name} — ${formatMoney(d.value)}`}</title>
              </path>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
